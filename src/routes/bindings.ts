import { AppBinding, AppCallResponse } from "@mattermost/types/apps";

import { Router } from "express";
import { manifest } from "./manifest";

const commandBindings = {
   app_id: manifest.app_id,
   label: manifest.display_name,
   location: "/command",
   bindings: [
      {
         app_id: manifest.app_id,
         icon: "meeting.png",
         label: "standup",
         hint: "[ start | register | settings ]",
         bindings: [
            // /standup start
            {
               app_id: manifest.app_id,
               location: "start",
               label: "start",
               submit: {
                  path: "/update/start",
                  expand: {
                     acting_user: "summary",
                     channel: "summary",
                  } as unknown,
               },
            },
            //  /standup register
            {
               app_id: manifest.app_id,
               location: "register",
               label: "register",
               hint: "[ user | channel ]",
               bindings: [
                  {
                     app_id: manifest.app_id,
                     location: "channel",
                     label: "channel",
                     submit: {
                        path: "/settings/register/channel",
                        expand: {
                           acting_user_access_token: "all",
                           acting_user: "summary",
                           channel: "summary",
                        } as unknown,
                     },
                  },
                  {
                     app_id: manifest.app_id,
                     location: "user",
                     label: "user",
                     submit: {
                        path: "/settings/register/user",
                        expand: {
                           acting_user: "summary",
                           channel: "summary",
                        } as unknown,
                     },
                  },
               ],
            },
            // /standup settings
            {
               app_id: manifest.app_id,
               location: "settings",
               label: "settings",
               hint: "[ reminder | github]",
               bindings: [
                  {
                     app_id: manifest.app_id,
                     location: "reminder",
                     label: "reminder",
                     form: {
                        title: "Adjust Reminder",
                        header: "Change when you recieve reminders",
                        icon: "icon.png",
                        fields: [
                           {
                              name: "hour",
                              label: "hour",
                              type: "text",
                              subtype: "number",
                              description:
                                 "At what hour? Use 24 hour format (eg. 1 pm = 13)",
                           },
                           {
                              name: "minute",
                              label: "minute",
                              type: "text",
                              subtype: "number",
                              description: "At what minute?",
                           },
                           {
                              name: "skip-days",
                              label: "skip-days",
                              type: "text",
                              subtype: "input",
                              description:
                                 "Which days to skip? Format: Comma seperated, first 3 letters (eg. MON, FRI)",
                           },
                        ],
                        submit: {
                           path: "/settings/reminder",
                           expand: {
                              acting_user: "summary",
                              channel: "summary",
                           } as unknown,
                        },
                     },
                  },
                  {
                     app_id: manifest.app_id,
                     location: "github",
                     label: "github",
                     form: {
                        title: "Connect GitHub",
                        header: "Connect to a GitHub Project",
                        icon: "icon.png",
                        fields: [
                           {
                              name: "owner",
                              label: "owner",
                              type: "text",
                              subtype: "input",
                              is_required: true,
                              description: "GitHub user or organization",
                           },
                           {
                              name: "project",
                              label: "project",
                              type: "text",
                              subtype: "number",
                              is_required: true,
                              description: "Github Project (v2) number",
                           },
                           {
                              name: "token",
                              label: "token",
                              type: "text",
                              subtype: "input",
                              is_required: true,
                              description: "GitHub token",
                           },
                        ],
                        submit: {
                           path: "/settings/github",
                           expand: {
                              acting_user: "summary",
                              channel: "summary",
                           } as unknown,
                        },
                     },
                  },
               ],
            },
            {
               app_id: manifest.app_id,
               location: "debug",
               label: "debug",
               bindings: [
                  {
                     app_id: manifest.app_id,
                     location: "submit",
                     label: "submit",
                     submit: {
                        path: "/update/submit?debug=true",
                        expand: {
                           acting_user_access_token: "all",
                           acting_user: "summary",
                           channel: "summary",
                        } as unknown,
                     },
                  },
               ],
            },
         ],
      },
   ],
} as AppBinding;

const router = Router();

router.post("/", (req, res) => {
   const callResponse: AppCallResponse<AppBinding[]> = {
      type: "ok",
      data: [commandBindings],
   };
   res.json(callResponse);
});

export default router;
