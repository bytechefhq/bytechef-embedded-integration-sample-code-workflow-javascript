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

for (const inputArgument of inputArguments) {
    const separatorIndex = inputArgument.indexOf('=');

    input[inputArgument.slice(0, separatorIndex)] = inputArgument.slice(separatorIndex + 1);
}

for (const workflow of definition.workflows) {
    console.log('workflow ' + workflow.name + ' (' + workflow.label + ')' +
        (workflow.triggers ? ' triggers: ' + workflow.triggers.map((trigger) => trigger.type).join(', ') : ''));

    const workflowInput = Object.assign({}, input);

    for (const task of workflow.tasks || []) {
        if (typeof task.name !== 'string' || typeof task.perform !== 'function') {
            fail('every task needs a name and a perform function');
        }

        const context = {
            component: {},
            connection: () => ({}),
            input: (name) => (name === undefined ? workflowInput : workflowInput[name]),
            log: (level, message) => console.log('  [' + level + '] ' + message),
            parameters: () => task.parameters || {},
        };

        const result = task.perform(context);

        console.log('  task ' + task.name + ' -> ' + JSON.stringify(result));

        workflowInput[task.name] = result;
    }
}

console.log('OK');
