// Evaluates a code workflow file the way the ByteChef server does - the file is one expression and the
// server reads the object it evaluates to - then checks its shape and runs every task once.
//
// Usage: node scripts/check.js <file> [inputName=value ...]

const fs = require('fs');
const vm = require('vm');

const [file, ...inputArguments] = process.argv.slice(2);

if (!file) {
    console.error('Usage: node scripts/check.js <file> [inputName=value ...]');

    process.exit(1);
}

const definition = vm.runInNewContext(fs.readFileSync(file, 'utf8'), {}, {filename: file});

function fail(message) {
    console.error('FAIL: ' + message);

    process.exit(1);
}

if (definition === null || typeof definition !== 'object') {
    fail('the file must evaluate to an object - wrap it in parentheses: ({ ... })');
}

if ('componentName' in definition) {
    if (typeof definition.componentName !== 'string' || !Number.isInteger(definition.componentVersion)) {
        fail('an integration needs a componentName string and an integer componentVersion');
    }

    console.log('integration ' + definition.componentName + ' v' + definition.componentVersion);
} else {
    if (typeof definition.name !== 'string' || definition.name === '') {
        fail('a project needs a name');
    }

    console.log('project ' + definition.name + ' version ' + definition.version);
}

if (!Array.isArray(definition.workflows) || definition.workflows.length === 0) {
    fail('workflows must be a non-empty array');
}

const input = {};

// Stands in for the platform: a component action returns a fixed sample, a trigger output and a request body are
// fixed samples too, and a declared connection has no parameters, so every task can run without a server or a real
// connection.
const sampleEmail = {from: 'ada@example.com', id: '18c2f0a1', subject: 'Welcome', threadId: '18c2f0a1'};

const component = new Proxy({}, {
    get: (target, componentName) => new Proxy({}, {
        get: (actionTarget, actionName) => (actionInput, connectionName) => {
            console.log('  ' + String(componentName) + '.' + String(actionName) + '(' + JSON.stringify(actionInput) +
                ', ' + JSON.stringify(connectionName) + ')');

            return {messages: [sampleEmail]};
        },
    }),
});

function taskConnection(task) {
    const connections = task.connections || [];

    const connectionNames = Array.isArray(connections)
        ? connections.map((connection) => connection.name)
        : Object.keys(connections);

    return Object.fromEntries(connectionNames.map((connectionName) => [connectionName, {}]));
}

function triggerOutput(trigger) {
    if (trigger.type.startsWith('request/') || trigger.type.startsWith('apiPlatform/')) {
        return {body: {}};
    }

    return sampleEmail;
}

const componentTaskTypePattern = /^[^/\s]+\/v[1-9]\d{0,8}\/[^/\s]+$/;

function evaluate(expression, values) {
    let value = values;

    for (const segment of expression.match(/[^.[\]]+/g) || []) {
        if (value === null || value === undefined) {
            return undefined;
        }

        value = value[segment];
    }

    return value;
}

function jsonText(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
}

function resolveParameter(parameter, values) {
    if (typeof parameter === 'string') {
        const wholeExpression = parameter.match(/^\$\{([^}]+)\}$/);

        if (wholeExpression) {
            return evaluate(wholeExpression[1], values);
        }

        return parameter.replace(/\$\{([^}]+)\}/g, (match, expression) => jsonText(evaluate(expression, values)));
    }

    if (Array.isArray(parameter)) {
        return parameter.map((item) => resolveParameter(item, values));
    }

    if (parameter !== null && typeof parameter === 'object') {
        return Object.fromEntries(
            Object.entries(parameter).map(([key, value]) => [key, resolveParameter(value, values)]));
    }

    return parameter;
}

function runComponentTask(task, values) {
    if (!componentTaskTypePattern.test(task.type)) {
        fail('task ' + task.name + ' has type ' + task.type +
            '; a component task type is <component>/v<version>/<action>');
    }

    if ('perform' in task || 'connections' in task) {
        fail('task ' + task.name + ' runs component action ' + task.type +
            ', so it cannot declare perform or connections');
    }

    const parameters = resolveParameter(task.parameters || {}, values);

    console.log('  ' + task.type + '(' + JSON.stringify(parameters) + ')');

    return parameters;
}

for (const inputArgument of inputArguments) {
    const separatorIndex = inputArgument.indexOf('=');

    input[inputArgument.slice(0, separatorIndex)] = inputArgument.slice(separatorIndex + 1);
}

for (const workflow of definition.workflows) {
    console.log('workflow ' + workflow.name + ' (' + workflow.label + ')' +
        (workflow.triggers ? ' triggers: ' + workflow.triggers.map((trigger) => trigger.type).join(', ') : ''));

    const workflowInput = Object.assign({}, input);

    for (const trigger of workflow.triggers || []) {
        workflowInput[trigger.name] = triggerOutput(trigger);
    }

    for (const task of workflow.tasks || []) {
        if (typeof task.name === 'string' && typeof task.type === 'string') {
            const componentTaskResult = runComponentTask(task, workflowInput);

            console.log('  task ' + task.name + ' -> ' + JSON.stringify(componentTaskResult));

            workflowInput[task.name] = componentTaskResult;

            continue;
        }

        if (typeof task.name !== 'string' || typeof task.perform !== 'function') {
            fail('every task needs a name and either a perform function or a component action type');
        }

        const context = {
            component: component,
            log: (level, message) => console.log('  [' + level + '] ' + message),
        };

        const taskInput = Object.assign({}, workflowInput);

        const result = task.perform.length >= 3
            ? task.perform(taskInput, taskConnection(task), context)
            : task.perform(taskInput, context);

        console.log('  task ' + task.name + ' -> ' + JSON.stringify(result));

        workflowInput[task.name] = result;
    }
}

console.log('OK');
