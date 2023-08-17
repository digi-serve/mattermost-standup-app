import { Router } from "express";
import { deleteUpdater, getUpdater } from "../classes/UpdateBuilder";
import { AppContext } from "../../@types/mattermost";
import { respondOk, respondMissing, respondForm } from "../utils/response";

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
   // Respond before showing the form
   respondOk(res);
   const updater = await getUpdater(context.acting_user.id, req.app);
   updater.showAddForm("", state, index);
});

router.post("/next", async (req, res) => {
   const context = req.body.context as AppContext;
   if (!context.acting_user?.id) return respondMissing(res, "acting_user.id");
   const updater = await getUpdater(context.acting_user.id, req.app);
   updater.updateState();
   respondOk(res);
});

router.post("/add", async (req, res) => {
   const submission = req.body.submission;
   const type = req.body.state;
   const userID = req.body.user_id;
   if (!userID) return respondMissing(res, "user_id");
   const updater = await getUpdater(userID, req.app);
   updater.processFormAdd(submission, type);

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
   // const triggerID = req.body.trigger_id;
   const userID = context.acting_user?.id;
   if (!userID) return respondMissing(res, "context.acting_user.id");
   const token = context.acting_user_access_token;
   if (!token) return respondMissing(res, "acting_user_access_token");
   const updater = await getUpdater(userID, req.app);
   updater.publishUpdate(token);
   respondOk(res);
});

export default router;
