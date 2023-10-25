import { AppField, AppForm } from "@mattermost/types/lib/apps";
import { GitHubIntegration } from "../classes/Github";
import UpdateBuilder from "../classes/UpdateBuilder";
import { app_id } from "../routes/manifest";

export async function displayStatuses(issues: string[], client: UpdateBuilder, gitHub: GitHubIntegration) {
   // send a loading message b/c this can take a while
   client.sendDM("...loading statuses", undefined, client.actionsPostID);
   // Remove duplicates
   issues = Array.from(new Set(issues));
   const statusLookups = issues.map(async (reference) => {
      try {
         const id = await gitHub.getProjectItemID(reference);
         if (!id ) return;
         return await gitHub.getIssueStatus(id);
      } catch (e) {
         console.log(e);
         return;
      }
   });

   const statuses = await Promise.all(statusLookups);
   const issueStatuses = issues.map(
      (issue, index) => { 
      return { name: issue, status: statuses[index] ?? "not found"} 
   });
   const message = issueStatuses.map(
      (i) => `${i.name} - ${i.status}`
   ).join("\n");
   // wip
   const bindings: Record<string, any>[] = [
      {
         app_id,
         location: "embedded",
         description: `> **_Update Statuses?_**\n${message}`,
         bindings: [
            {
               location: "update",
               label: "Update",
               form: generateUpdateStatusForm(issueStatuses)
            },
            {
               location: "done",
               label: "Done",
               submit: {
                  path: "/update/close",
                  expand: {
                     post: "summary",            
                     acting_user: "summary",
                  }
               }
            },
         ],
      },
   ];
   client.sendDM("", { app_bindings: bindings }, client.actionsPostID);
}

const statuses = [
    "📫 Inbox",
    "📈 Prioritized",
    "🚧 In Progress",
    "💬 Code Review",
    "📋 Partner Review",
    "🚀 Deploying",
    "✔ Done",
];

function statusesAfter(status: string) {
  const index = statuses.indexOf(status);
  if (index < 0) return [];
  return statuses.slice(index + 1)
}

function generateUpdateStatusForm(issues: Record<"name"|"status", string>[]) {
   const form: AppForm = {
      title: "Update Statuses",
      header: "Update status for the given issues below. Leave them blank to keep the current statuses.",
      fields: [],
      submit: {
         path: "/update/status",
         expand: {
            acting_user: "summary",
         }, 
      },
   };

   
   issues.forEach(({ name, status }) => {
      const field: AppField = {
         name,
         modal_label: name,
         type: "static_select",
         options: statusesAfter(status).map(s => { return { value: s, label: s } }),
      };
      form.fields?.push(field);

   });

   return form;

}
export async function updateStatuses(
   values: Record<string, Record<"value", string>>,
   gh: GitHubIntegration,
   client: UpdateBuilder
) {
   let issues = Object.keys(values);
   // remove null values
   issues = issues.filter(i => values[i]);
   const updates = issues.map(issue => gh.updateStatus(issue, values[issue].value));
   await Promise.all(updates);
   client.sendDM(
      `Updated ${updates.length} status${updates.length > 1 ? "es" : ""}`,
      undefined,
      client.actionsPostID
   );
}
