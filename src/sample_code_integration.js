({
    componentName: "httpClient",
    componentVersion: 1,
    version: "0.0.1",
    description: "A sample code integration built on the HTTP Client component.",
    workflows: [
        {
            name: "echoMessage",
            label: "Echo Message",
            description: "Returns the message it was given, upper-cased.",
            inputs: [{name: "message", label: "Message", type: "STRING", required: true}],
            outputs: [{name: "result", task: "shout"}],
            tasks: [
                {
                    name: "shout",
                    label: "Shout",
                    description: "Upper-cases the message.",
                    perform: function (context) {
                        return String(context.input("message")).toUpperCase();
                    }
                }
            ]
        }
    ]
})
