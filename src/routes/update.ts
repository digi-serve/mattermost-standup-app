import { Router } from "express";
import { deleteUpdater, getUpdater } from "../classes/UpdateBuilder";
import { AppContext } from "../../@types/mattermost";
import { respondOk, respondMissing, respondForm } from "../utils/response";
import { updateStatuses } from "../utils/statusUpdates";

const router = Router();

router.post("/start", async (req, res) => {
   const context = req.body.context as AppContext;
   if (!context.acting_user?.id)
      return respondMissing(res, "context.acting_user.id");
   // Remove the old updater;
   deleteUpdater(context.acting_user.id);
   // create the updater
   const updater = await getUpdater(
      context.acting_user.id,
      req.app,
      context.bot_access_token,
   );
   try {
      await updater.start();
      respondOk(res);
   } catch (error) {
      console.log(error);
   }
});

router.post("/form", async (req, res) => {
   const context = req.body.context as AppContext;
   if (!context.acting_user?.id) return respondMissing(res, "acting_user.id");
   const index = parseInt(req.body.state.index);
   const state = req.body.state.type ?? "accomplished";
   const updater = await getUpdater(context.acting_user.id, req.app);
   const form = updater.getAddForm(state, index);
   respondForm(res, form);
});

router.post("/next", async (req, res) => {
   const context = req.body.context as AppContext;
   if (!context.acting_user?.id) return respondMissing(res, "acting_user.id");
   const updater = await getUpdater(context.acting_user.id, req.app);
   updater.updateState();
   respondOk(res);
});

router.post("/add", async (req, res) => {
   const context = req.body.context as AppContext;
   if (!context.acting_user?.id) return respondMissing(res, "acting_user.id");
   const type = req.body.state.updaterState;
   const updater = await getUpdater(context.acting_user.id, req.app);
   updater.processFormAdd(req.body.values, type);

   respondOk(res);
});

router.post("/edit", async (req, res) => {
   const context = req.body.context as AppContext;
   const userID = context.acting_user?.id;
   if (!userID) return respondMissing(res, "user_id");
   const updater = await getUpdater(userID, req.app);
   const form = updater.generateEditForm();
   respondForm(res, form);
});

router.post("/edit/submit", async (req, res) => {
   const context = req.body.context as AppContext;
   const userID = context.acting_user?.id;
   if (!userID) return respondMissing(res, "user_id");
   respondOk(res);
   const updater = await getUpdater(userID, req.app);
   updater.editUpdate(req.body.values);
});

router.post("/submit", async (req, res) => {
   const context = req.body.context as AppContext;
   if (req.query.debug)
      console.log(
         "`/standup debug submit` called by",
         context.acting_user?.username,
      );
   const userID = context.acting_user?.id;
   if (!userID) return respondMissing(res, "context.acting_user.id");
   const token = context.acting_user_access_token;
   if (!token) return respondMissing(res, "acting_user_access_token");
   const updater = await getUpdater(userID, req.app, context.bot_access_token);
   updater.publishUpdate(token);
   respondOk(res);
});

router.post("/status", async (req, res) => {
   const context = req.body.context as AppContext;
   const githubIntegration = req.app.locals.githubIntegration;
   const userID = context.acting_user?.id;
   if (!userID) return respondMissing(res, "user_id");
   const updater = await getUpdater(userID, req.app);
   respondOk(res);
   updateStatuses(req.body.values, githubIntegration, updater);
});

router.post("/close", async (req, res) => {
   const context = req.body.context as AppContext;
   const userID = context.acting_user?.id;
   if (!userID) return respondMissing(res, "user_id");
   const updater = await getUpdater(userID, req.app);
   updater.sendDM("", undefined, context.post.id);
   respondOk(res);
});

export default router;
