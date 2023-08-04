import { Router } from "express";
import { AppManifest, Locations, Permission } from "@mattermost/types/apps";

interface ExtendedAppManifest extends AppManifest {
   http: Record<string, string | boolean>;
}

export const manifest = {
   app_id: "standup-bot",
   display_name: "Standup Bot",
   description: "Facilitate Async Standups",
   homepage_url: "https://github.com/digi-serve/mattermost-standup-app",
   app_type: "http",
   icon: "meeting.png",
   http: {
      root_url: "",
      use_jwt: process.env.APP_JWT_SECRET ? true : false,
   },
   // on_install: "/install",
   requested_permissions: [Permission.ActAsBot, Permission.ActAsUser],
   requested_locations: [Locations.Command, Locations.InPost],
} as ExtendedAppManifest;

const router = Router();

router.get("", (req, res) => {
   manifest.http.root_url = `${req.app.locals.host}:${req.app.locals.port}`;
   res.json(manifest);
});

export default router;
