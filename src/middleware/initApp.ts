import initBotClient from "../init/botClient";
import { AppContext } from "../../@types/mattermost";
import { NextFunction, Request, Response } from "express";

export default async function (
   req: Request,
   res: Response,
   next: NextFunction,
) {
   const context = req.body.context as AppContext;
   if (!req.app.locals.appReady) {
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
      // This is a session token, so can expire.
   } else if (
      context?.bot_access_token &&
      req.app.locals.botClientToken !== context.bot_access_token
   ) {
      console.log("Bot Token Mismatch, fixing.");
      req.app.locals.botClientToken = context.bot_access_token;
      req.app.locals.botClient.setToken(context.bot_access_token);
   }
   return next();
}
