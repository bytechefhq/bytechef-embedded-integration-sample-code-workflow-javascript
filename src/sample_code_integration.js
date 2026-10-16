({
    componentName: "googleMail",
    componentVersion: 1,
    version: "0.0.1",
    description: "A sample code integration built on the Gmail component.",
    workflows: [
        {
            name: "summarizeNewEmail",
            label: "Summarize New Email",
            description: "Runs for every new email in the connected user's inbox and logs who sent it.",
            // A Gmail trigger on a Gmail integration runs on the connection the connected user created when they
            // connected the integration - nothing to declare.
            triggers: [{name: "newEmail", type: "googleMail/v1/newEmailPolling", parameters: {format: "SIMPLE"}}],
            outputs: [{name: "summary", task: "summarize"}],
            tasks: [
                {
                    name: "summarize",
                    label: "Summarize",
                    description: "Builds a one-line summary of the new email.",
                    perform: function (context) {
                        const email = context.input("newEmail");

                        const summary = "New email from " + email.from + ": " + email.subject;

                        context.log("info", summary);

                        return summary;
                    }
                }
            ]
        },
        {
            name: "fetchRecentEmails",
            label: "Fetch Recent Emails",
            description: "Returns the connected user's most recent emails, optionally only those from one sender.",
            // awaitWorkflowAndRespond makes a call to the workflow return its outputs.
            triggers: [{name: "request", type: "request/v1/awaitWorkflowAndRespond"}],
            outputs: [{name: "emails", task: "fetchEmails"}],
            tasks: [
                {
                    name: "fetchEmails",
                    label: "Fetch Emails",
                    description: "Searches the inbox with the Gmail Search Email action.",
                    // A call to the integration's own component needs no declared connection: it runs on the connected
                    // user's integration connection. Declare and name only connections to other components.
                    perform: function (context) {
                        const request = context.input()["request"] || {};
                        const body = request.body || {};

                        const result = context.component.googleMail.searchEmail(
                            {from: body.from, maxResults: body.maxResults || 10});

                        context.log("info", "Found " + (result.messages || []).length + " emails");

                        return result.messages || [];
                    }
                }
            ]
        },
        {
            name: "notifySlackOnNewEmail",
            label: "Notify Slack on New Email",
            description: "Posts every new email in the connected user's inbox to a Slack channel.",
            inputs: [{name: "channel", label: "Slack Channel ID", type: "STRING", required: true}],
            triggers: [{name: "newEmail", type: "googleMail/v1/newEmailPolling", parameters: {format: "SIMPLE"}}],
            outputs: [{name: "message", task: "postToSlack"}],
            tasks: [
                {
                    name: "postToSlack",
                    label: "Post to Slack",
                    description: "Posts the sender and subject with the Slack Send Channel Message action.",
                    // Slack is not the integration's component, so the task declares its connection and
                    // passes the name. An administrator picks the Slack connection when enabling the
                    // workflow in the integration's instance configuration.
                    connections: [{componentName: "slack", name: "slack"}],
                    perform: function (context) {
                        const email = context.input("newEmail");

                        const text = "New email from " + email.from + ": " + email.subject;

                        const message = context.component.slack.sendChannelMessage(
                            {channel: context.input("channel"), text: text}, "slack");

                        context.log("info", "Posted to Slack: " + text);

                        return message;
                    }
                }
            ]
        }
    ]
})
