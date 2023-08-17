import express from "express";

// Shim for mattermost-redux global fetch access
global.fetch = require("node-fetch");

// middlewares
import initApp from "./middleware/initApp";

// routes
import update from "./routes/update";
import bindings from "./routes/bindings";
import manifest from "./routes/manifest";
import settings from "./routes/settings";

// types
import { AppContext } from "../@types/mattermost";
import { expressjwt } from "express-jwt";

// const host = process.env.APP_HOST || 'localhost';
const host = process.env.APP_HOST || "http://host.docker.internal";
const port = process.env.APP_PORT ?? "4005";

const app = express();
app.use(express.json());

app.locals.host = host;
app.locals.port = port;

// Uncomment these lines to enable verbose debugging of requests and responses
// import logger from "./middleware/logger";
// app.use(logger);

app.use((req, res, next) => {
   console.log(`${req.method} ${req.url}`);
   next();
});

app.use((req, res, next) => {
   const context = req.body.context as AppContext;

   // This is used to interact with the Mattermost server in the docker-compose dev environment.
   // We ignore the site URL sent in call requests, and instead use the known site URL from the environment variable.
   if (context?.mattermost_site_url && process.env.MATTERMOST_SITEURL) {
      context.mattermost_site_url = process.env.MATTERMOST_SITEURL;
   }

   next();
});

// Serve resources from the static folder
app.use("/static", express.static("./static"));

app.use("/manifest.json", manifest);

if (process.env.APP_JWT_SECRET) {
   app.use(
      expressjwt({
         secret: process.env.APP_JWT_SECRET,
         algorithms: ["HS256"],
         // header format Bearer
         getToken: (req) =>
            req
               .header("Mattermost-App-Authorization")
               ?.match(/Bearer\s(.+)/)?.[1],
      }).unless({ path: /update\/(?!start).+/ }),
   );
   app.use(function (err, req, res, next) {
      if (err.name === "UnauthorizedError") {
         console.log("invalid token...");
         res.status(401).send("invalid token...");
      } else {
         next(err);
      }
   });
}

app.use(initApp);

app.use("/bindings", bindings);

app.use("/update", update);

app.use("/settings", settings);

app.listen(port, () => {
   console.log(`app listening on port ${port}`);
});
