import initBotClient from "../init/botClient";
import { ExtendedContext } from "../../@types/mattermost-extended";

export default async function (req, res, next) {
   if (!req.app.locals.appReady) {
      const context = req.body.context as ExtendedContext;
      if (
         context?.mattermost_site_url &&
         context?.bot_access_token &&
         context?.bot_user_id
      ) {
         await initBotClient(
            context.mattermost_site_url,
            context.bot_access_token,
            context.bot_user_id,
            req.app,
         );
      }
   }
   return next();
}
