// Strings that are different based on update / builder states;

import { UPDATE_TYPES } from "../classes/Update";
import { STATES as BUILDER_STATES } from "../classes/UpdateBuilder";

type UpdateTypeStrings = Record<keyof typeof UPDATE_TYPES, string | undefined>;
type BuilderStateStrings = Record<
   keyof typeof BUILDER_STATES,
   string | undefined
>;

const labels = {
   update: {
      headings: {
         accomplished: "I worked on",
         goal: "My goals for today are",
         block: "I'm blocked",
         question: "Question",
         help: "I want help with",
         prayer: "Prayer Request",
         personal: "Personal Update",
      },
      emojis: {
         accomplished: ":white_check_mark:",
         goal: ":dart:",
         block: ":rotating_light:",
         question: ":question:",
         help: ":handshake:",
         prayer: ":pray:",
         personal: ":speech_balloon:",
      },
   } as Record<string, UpdateTypeStrings>,
   builder: {
      question: {
         todo: undefined,
         review:
            "These were your goal last time, add them as items you worked on?",
         accomplished: "What did you work on?",
         goal: "What are your goals today?",
         block: "Are you blocked or need help from the team?",
         personal: "Any personal updates or prayer requests?",
         submit: "Ready to publish?",
      },
      note: {
         todo: undefined,
         review: "Description",
         accomplished: "Description",
         goal: "Goal",
         block: undefined,
         personal: undefined,
         submit: undefined,
      },
      noteHelp: {
         todo: undefined,
         review: "Describe the work you did.",
         accomplished: "Describe the work you did.",
         goal: "What do you want to get done?",
         block: undefined,
         personal: undefined,
         submit: undefined,
      },
   } as Record<string, BuilderStateStrings>,
};

export function label(
   type: "update" | "builder",
   key: string,
   state: keyof typeof UPDATE_TYPES | keyof typeof BUILDER_STATES,
) {
   return labels[type][key]?.[state];
}
