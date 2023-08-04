# Standups for Mattermost

## Install & Usage
Add Environment Variables to .env
```
APP_HOST="http://myhost.com"
APP_PORT=4005
APP_JWT_SECRET="OptionalSecret"
```
Then 
```
npm install

npm run dist

npm run server
```

From mattermost as Admin run:
```
/apps install http "<host>:<port>/manifest.json
```

After install, from the Standup channel
```
/standup register channel
```

To add GitHub integration
```
/standup settings github --owner <owner> --project <project> --token <token>
```

<a href="https://www.flaticon.com/free-icons/meeting" title="meeting icons">Meeting icons created by Pixel perfect - Flaticon</a>

