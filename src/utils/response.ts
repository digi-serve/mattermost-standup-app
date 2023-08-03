import { AppCallResponse } from "@mattermost/types/lib/apps";
import { Response } from "express";

export function respondOk(res: Response) {
   const callResponse: AppCallResponse = {
      type: "ok",
   };
   res.json(callResponse);
}

export function respondMissing(res: Response, missing: string) {
   res.status(400).send(`Missing expected parameter '${missing}'`);
}

export function respondUnauthorized(res: Response, message?: string) {
   res.status(401).send(`Unauthorized${message ? `: ${message}` : ""}`);
}

export function respondError(
   res: Response,
   message: string,
   code: number = 500,
) {
   res.status(code).send(message);
}
