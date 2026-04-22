export async function onRequest(context) {
  const { request } = context;

  if (request.method === "POST") {
    return handlePost(context);
  }

  return Response.json(
    {
      ok: true,
      message: "Employment form endpoint is live. Use POST to submit applications."
    },
    { status: 200 }
  );
}

async function handlePost(context) {
  try {
    const { request, env } = context;

    if (!env.RESEND_API_KEY) {
      return Response.json(
        { ok: false, error: "Missing RESEND_API_KEY environment variable in Cloudflare." },
        { status: 500 }
      );
    }

    if (!env.FROM_EMAIL) {
      return Response.json(
        { ok: false, error: "Missing FROM_EMAIL environment variable in Cloudflare." },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return Response.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    if (
      !body?.applicant?.firstName ||
      !body?.applicant?.lastName ||
      !body?.applicant?.phone ||
      !body?.applicant?.email ||
      !body?.applicant?.desiredPay
    ) {
      return Response.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(body?.applicant?.jobPositions) ||
      body.applicant.jobPositions.length === 0
    ) {
      return Response.json(
        { ok: false, error: "At least one job position must be selected." },
        { status: 400 }
      );
    }

    const recipients = [
      "jwslady14@gmail.com",
      "brandin112898@hotmail.com",
      "jwspizzeriaandgrill@gmail.com"
    ];

    function esc(value = "") {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function row(label, value) {
      return `
        <tr>
          <td style="padding:10px 12px;border:1px solid #ddd;font-weight:700;background:#f8f8f8;width:220px;">${esc(label)}</td>
          <td style="padding:10px 12px;border:1px solid #ddd;">${esc(value || "-")}</td>
        </tr>
      `;
    }

    function renderEducation(items = []) {
      if (!items.length) return "<p>No education entries provided.</p>";

      return items.map((item, index) => `
        <div style="margin-bottom:18px;">
          <h3 style="margin:0 0 8px;">School ${index + 1}</h3>
          <table style="width:100%;border-collapse:collapse;">
            ${row("School Name", item.schoolName)}
            ${row("Type of School", item.schoolType)}
            ${row("Graduation Date", item.graduationDate)}
          </table>
        </div>
      `).join("");
    }

    function renderEmployment(items = []) {
      if (!items.length) return "<p>No employment history provided.</p>";

      return items.map((item, index) => `
        <div style="margin-bottom:18px;">
          <h3 style="margin:0 0 8px;">Employment History ${index + 1}</h3>
          <table style="width:100%;border-collapse:collapse;">
            ${row("Employer", item.employer)}
            ${row("Job Title", item.jobTitle)}
            ${row("Work Phone", item.workPhone)}
            ${row("End Pay Rate", item.endPayRate)}
            ${row("Address Line 1", item.address1)}
            ${row("Address Line 2", item.address2)}
            ${row("City", item.city)}
            ${row("State", item.state)}
            ${row("Zip", item.zip)}
            ${row("Employed From", item.employedFrom)}
            ${row("Employed To", item.employedTo)}
            ${row("Reason for Leaving", item.reasonForLeaving)}
          </table>
        </div>
      `).join("");
    }

    function renderReferences(items = []) {
      if (!items.length) return "<p>No references provided.</p>";

      return items.map((item, index) => `
        <div style="margin-bottom:18px;">
          <h3 style="margin:0 0 8px;">Reference ${index + 1}</h3>
          <table style="width:100%;border-collapse:collapse;">
            ${row("First Name", item.firstName)}
            ${row("Last Name", item.lastName)}
            ${row("Company", item.company)}
            ${row("Title", item.title)}
            ${row("Phone", item.phone)}
            ${row("Email", item.email)}
          </table>
        </div>
      `).join("");
    }

    const applicant = body.applicant;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;">
        <h1 style="margin-bottom:8px;">New Employment Application</h1>
        <p style="margin-top:0;">A new application was submitted from the Johnny's Grill & Pizzeria website.</p>

        <h2>Applicant Information</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          ${row("First Name", applicant.firstName)}
          ${row("Last Name", applicant.lastName)}
          ${row("Phone", applicant.phone)}
          ${row("Email", applicant.email)}
          ${row("Address Line 1", applicant.address1)}
          ${row("Address Line 2", applicant.address2)}
          ${row("City", applicant.city)}
          ${row("State", applicant.state)}
          ${row("Zip", applicant.zip)}
          ${row("Job Positions", Array.isArray(applicant.jobPositions) ? applicant.jobPositions.join(", ") : "")}
          ${row("Start Date", applicant.startDate)}
          ${row("Desired Pay", applicant.desiredPay)}
          ${row("Availability", applicant.availability)}
          ${row("Notes", applicant.notes)}
        </table>

        <h2>Education</h2>
        ${renderEducation(body.education)}

        <h2>Employment History</h2>
        ${renderEmployment(body.employmentHistory)}

        <h2>References</h2>
        ${renderReferences(body.references)}
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: recipients,
        subject: `New Job Application - ${applicant.firstName} ${applicant.lastName}`,
        reply_to: applicant.email,
        html
      })
    });

    const rawResend = await resendResponse.text();
    let resendData = null;

    try {
      resendData = rawResend ? JSON.parse(rawResend) : null;
    } catch (e) {
      resendData = null;
    }

    if (!resendResponse.ok) {
      return Response.json(
        {
          ok: false,
          error: (resendData && (resendData.message || resendData.error)) || "Email provider error."
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Server error."
      },
      { status: 500 }
    );
  }
}