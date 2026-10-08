import { handleMenu } from '../../lib/spoton.js';
export const onRequest = ({request,env}) => handleMenu(request,env);
