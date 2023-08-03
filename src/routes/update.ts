import { Router } from "express";
import { getUpdater } from "../classes/UpdateBuilder";
import { ExtendedContext as Context } from "../../@types/mattermost-extended";
import { respondOk, respondMissing } from "../utils/response";

const router = Router();

router.post("/start", async (req, res) => {
   const context = req.body.context as Context;
   if (!context.acting_user?.id)
      return respondMissing(res, "context.acting_user.id");
   // create the updater
   const updater = await getUpdater(
      context.acting_user.id,
      req.app,
      context.acting_user_access_token,
   );
   try {
      await updater.start();
      respondOk(res);
   } catch (error) {
      console.log(error);
   }
});

router.post("/form", async (req, res) => {
   const userID = req.body.user_id;
   if (!userID) return respondMissing(res, "user_id");
   const index = parseInt(req.body.context.index);
   const triggerID = req.body.trigger_id;
   const state = req.body.context.type ?? "accomplished";
   // Respond before showing the form
   respondOk(res);
   const updater = await getUpdater(userID, req.app);
   updater.showAddForm(triggerID, state, index);
});

router.post("/next", async (req, res) => {
   const userID = req.body.user_id;
   if (!userID) return respondMissing(res, "user_id");
   const updater = await getUpdater(userID, req.app);
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
   const triggerID = req.body.trigger_id;
   const userID = req.body.user_id;
   if (!userID) return respondMissing(res, "user_id");
   respondOk(res);
   const updater = await getUpdater(userID, req.app);
   updater.showEditForm(triggerID);
});

router.post("/edit/submit", async (req, res) => {
   const userID = req.body.user_id;
   if (!userID) return respondMissing(res, "user_id");
   respondOk(res);
   const updater = await getUpdater(userID, req.app);
   updater.editUpdate(req.body.submission);
});

router.post("/submit", async (req, res) => {
   // const triggerID = req.body.trigger_id;
   const userID = req.body.user_id;
   if (!userID) return respondMissing(res, "user_id");
   const updater = await getUpdater(userID, req.app);
   updater.publishUpdate();
   respondOk(res);
});

export default router;
