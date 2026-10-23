/// <reference types="@bytechef/workflow-api" />

interface Email {
    from: string;
    id: string;
    subject: string;
    threadId: string;
}

interface FetchRecentEmailsRequest {
    body?: {from?: string; maxResults?: number};
}

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
            triggers: [{name: "newEmail", type: "googleMail/v1/newEmailPolling", parameters: {format: "SIMPLE"}}],
            outputs: [{name: "summary", task: "summarize"}],
            tasks: [
                {
                    name: "summarize",
                    label: "Summarize",
                    description: "Builds a one-line summary of the new email.",
                    perform: (context) => {
                        const email = context.input("newEmail") as Email;

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
            triggers: [{name: "request", type: "request/v1/awaitWorkflowAndRespond"}],
            outputs: [{name: "emails", task: "fetchEmails"}],
            tasks: [
                {
                    name: "fetchEmails",
                    label: "Fetch Emails",
                    description: "Searches the inbox with the Gmail Search Email action.",
                    perform: (context) => {
                        const request = (context.input()["request"] || {}) as FetchRecentEmailsRequest;
                        const body = request.body || {};

                        const result: {messages?: Email[]} = context.component.googleMail.searchEmail(
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
            inputs: [
                {
                    name: "channel", label: "Slack Channel", type: "STRING", required: true,
                    componentName: "slack", componentVersion: 1, groupName: "channel"
                }
            ],
            triggers: [{name: "newEmail", type: "googleMail/v1/newEmailPolling", parameters: {format: "SIMPLE"}}],
            outputs: [{name: "message", task: "postToSlack"}],
            tasks: [
                {
                    name: "postToSlack",
                    label: "Post to Slack",
                    description: "Posts the sender and subject with the Slack Send Channel Message action.",
                    connections: [{componentName: "slack", name: "slack"}],
                    perform: (context) => {
                        const email = context.input("newEmail") as Email;

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
}) satisfies ByteChef.IntegrationDefinition;
