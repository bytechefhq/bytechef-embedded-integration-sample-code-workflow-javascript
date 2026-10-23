# bytechef-embedded-integration-sample-code-workflow-javascript

A sample ByteChef **embedded code integration** written in JavaScript. The whole integration is one file,
[`src/sample_code_integration.js`](src/sample_code_integration.js), and that file is what you deploy - there is no
build step. The file is a single parenthesized object expression, `({ ... })`. The server evaluates it and reads the
object's `componentName`, `componentVersion`, `description`, `version` and `workflows`, then calls each task's
`perform(context)` when the workflow runs. Keep it a bare expression: a bundler or module wrapper hides the object
from the server.

A code integration is keyed by the component it integrates, and that component must exist on the server. This sample
uses the built-in Gmail component, `googleMail` version 1, so connecting the integration means connecting a Gmail
account. It has three workflows:

- `summarizeNewEmail` starts with the Gmail **New Email** polling trigger (`googleMail/v1/newEmailPolling`). It runs once
  for every new email and its `summarize` task returns a one-line summary as the `summary` output. A Gmail trigger on a
  Gmail integration runs on the connection the connected user created when they connected the integration - there is
  nothing to declare.
- `fetchRecentEmails` starts with a request trigger, so you call it over HTTP. Its `fetchEmails` task calls the Gmail
  **Search Email** action and returns the matching messages as the `emails` output.
- `notifySlackOnNewEmail` starts with the same Gmail trigger and takes a required `channel` input; its options come from
  Slack's own `channel` input (`componentName`, `componentVersion` and `groupName` on the input), so it is picked from
  the Slack workspace's channels. Its `postToSlack` task calls the Slack **Send Channel Message** action, and Slack is
  not the integration's component, so the task declares a `slack` connection and passes its name. An administrator picks
  that connection when enabling the workflow in the integration's instance configuration; until one is picked the
  workflow cannot be enabled, and the channel list stays empty.

Inside `perform`, `context.input()` returns the workflow inputs, the trigger output (under the trigger's name) and the
output of every task that already ran (under the task's name); `context.input("newEmail")` returns one of them, and
`context.log(level, message)` writes to the execution log.

### Connections

A task calls an action of the integration's own component - `googleMail` here - without declaring a connection. It
runs on the connected user's integration connection, which ByteChef binds when the workflow runs:

```javascript
perform: function (context) {
    return context.component.googleMail.searchEmail({maxResults: 10});
}
```

A task that calls any other component (say `slack`) declares that connection and passes its name. An administrator
chooses it in the integration's instance configuration, and it is the same for every connected user:

```javascript
connections: [{componentName: "slack", name: "slack"}],
perform: function (context) {
    return context.component.slack.sendChannelMessage({channel: "C0123456", text: "New email"}, "slack");
}
```

## Check

```bash
npm run check
```

Evaluates the file the same way the server does, checks its shape and runs each task once with a stub context. It
needs only Node.js; the JavaScript file has no dependencies to install.

## TypeScript

[`src/sample_code_integration.ts`](src/sample_code_integration.ts) is the same integration written in TypeScript. It
takes its types from [`@bytechef/workflow-api`](https://www.npmjs.com/package/@bytechef/workflow-api) through a
`/// <reference types="@bytechef/workflow-api" />` directive and ends in `satisfies ByteChef.IntegrationDefinition`, so
`context` is typed inside every `perform` and a missing `componentName` or a misspelled `perform` fails the build. The
server runs only JavaScript, so compile the file and deploy the output:

```bash
npm install
npm run check:ts
```

`check:ts` compiles the file to `dist/sample_code_integration.js` and runs the same check on it. Deploy
`dist/sample_code_integration.js` in place of `src/sample_code_integration.js`; the directive and `satisfies` leave
nothing behind, so the output is the same bare `({ ... })` expression. Don't `import` or `export` anything in the `.ts`
file: either one turns it into a module, the output stops being a bare expression and the check fails. Both files
describe the same `googleMail` version 1 integration, so deploying either one deploys a new version of the same code
integration.

## Deploy

Upload `src/sample_code_integration.js`. Deploying again for the same component deploys a new version of the
existing code integration instead of creating a second one.

### From the UI

Embedded → **Integrations** → the arrow next to **New Integration** → **Import Code Integration**, then pick the file.

### Through the public API

`POST /api/embedded/v1/integration-code-workflows/deploy` with a `multipart/form-data` body holding one file part,
`integrationFile`: the `.js` file. The file name must end in `.js`; the server picks the language from the
extension. A successful deploy returns `204 No Content`.

Authenticate with `Authorization: Bearer <API key>`, using an **Embedded API key** (Embedded → Settings →
**API Keys**) that belongs to an administrator - deploying requires the admin role. This endpoint takes only a typed
API key: an organization admin key (Settings → Organization → **Admin API Keys**) is rejected with `401`. The key is
looked up in the environment named by the `X-ENVIRONMENT` header (`DEVELOPMENT`, `STAGING` or `PRODUCTION`;
`PRODUCTION` when the header is absent), so send the environment the key was created in. The request runs as the
key's own ByteChef user, not as a connected user.

```bash
curl -X POST "$BYTECHEF_URL/api/embedded/v1/integration-code-workflows/deploy" \
  -H "Authorization: Bearer $BYTECHEF_EMBEDDED_API_KEY" \
  -H "X-ENVIRONMENT: DEVELOPMENT" \
  -F "integrationFile=@src/sample_code_integration.js"
```

`BYTECHEF_URL` is the server's base URL, for example `http://localhost:9555` for a local development server.

## Enable and run

Deploying with `?enable=true` also enables the integration in that environment. A Gmail integration needs Gmail OAuth
app credentials first: an administrator enters them in the integration's instance configuration, and until then the
enable is refused.

Once a connected user has connected the integration and enabled `fetchRecentEmails` on their integration instance
(`POST /api/embedded/v1/integration-instances/{id}/workflows/{workflowUuid}/enable`), call it with their JWT:

```bash
curl -X POST "$BYTECHEF_URL/api/embedded/v1/workflows/$WORKFLOW_UUID" \
  -H "Authorization: Bearer $CONNECTED_USER_JWT" \
  -H "X-ENVIRONMENT: DEVELOPMENT" \
  -H "Content-Type: application/json" \
  -d '{"from": "ada@example.com", "maxResults": 5}'
```

The body is optional. `summarizeNewEmail` needs no call: once enabled, it runs whenever a new email arrives.
