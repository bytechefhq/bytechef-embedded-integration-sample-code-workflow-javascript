# bytechef-embedded-integration-sample-code-workflow-javascript

A sample ByteChef **embedded code integration** written in JavaScript. The whole integration is one file,
[`src/sample_code_integration.js`](src/sample_code_integration.js), and that file is what you deploy - there is no
build step. The file is a single parenthesized object expression, `({ ... })`. The server evaluates it and reads the
object's `componentName`, `componentVersion`, `description`, `version` and `workflows`, then calls each task's
`perform(context)` when the workflow runs. Keep it a bare expression: a bundler or module wrapper hides the object
from the server.

A code integration is keyed by the component it integrates, and that component must exist on the server. This sample
uses the built-in Gmail component, `googleMail` version 1, so connecting the integration means connecting a Gmail
account. It has two workflows:

- `summarizeNewEmail` starts with the Gmail **New Email** polling trigger (`googleMail/v1/newEmailPolling`). It runs once
  for every new email and its `summarize` task returns a one-line summary as the `summary` output. A Gmail trigger on a
  Gmail integration runs on the connection the connected user created when they connected the integration - there is
  nothing to declare.
- `fetchRecentEmails` starts with a request trigger, so you call it over HTTP. Its `fetchEmails` task calls the Gmail
  **Search Email** action and returns the matching messages as the `emails` output.

Inside `perform`, `context.input()` returns the workflow inputs, the trigger output (under the trigger's name) and the
output of every task that already ran (under the task's name); `context.input("newEmail")` returns one of them, and
`context.log(level, message)` writes to the execution log.

### Connections

A task names the connections it uses, and calls a component action through one of them:

```javascript
connections: [{componentName: "googleMail", name: "gmail"}],
perform: function (context) {
    return context.component.googleMail.searchEmail({maxResults: 10}, "gmail");
}
```

A connection on the integration's own component - `googleMail` here - is the connected user's integration connection;
ByteChef binds it when the workflow runs. A connection on any other component (say `slack`) is chosen by an
administrator in the integration's instance configuration and is the same for every connected user.

## Check

```bash
npm run check
```

Evaluates the file the same way the server does, checks its shape and runs each task once with a stub context. It
needs only Node.js; there are no dependencies to install.

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
