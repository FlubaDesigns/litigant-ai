#!/usr/bin/env node
/**
 * Mock-only authorization and scope guards. Run with:
 *   node --test scripts/test_lai_release.mjs
 * All evidence is synthetic. No credentials, GitHub calls, cloud calls, or deploys.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateDescriptor,
  validateDeploymentCommit,
  validatePreflightEvidence,
  selectSuccessfulCiRun,
  validateCheckJob,
  validateHostingConfig,
  runtimeFingerprint,
  assertServiceReady,
  assertAllowedImage,
  validateEngineApproval,
} from './lai-release.mjs';

const SOURCE = '0123456789abcdef0123456789abcdef01234567';
const DEPLOYMENT = '89abcdef0123456789abcdef0123456789abcdef';
const ENGINE = 'fedcba9876543210fedcba9876543210fedcba98';
const REPOSITORY = 'FlubaDesigns/litigant-ai';
const WORKFLOW = '.github/workflows/deploy-cloudrun.yml';
const IMAGE = `gcr.io/litigant-ai/api@sha256:${'1234567890abcdef'.repeat(4)}`;
const clone = (value) => structuredClone(value);
const changed = (value, mutate) => { const result = clone(value); mutate(result); return result; };

function engineApproval() {
  return { repository: 'FlubaDesigns/fluba-designs', commitSha: ENGINE, runId: '123457', runAttempt: 1 };
}
function approval() {
  return {
    controlSha: SOURCE,
    preflight: { runId: '123456', runAttempt: 1, headSha: SOURCE },
    engine: engineApproval(),
  };
}
function descriptor(action = 'inspect') {
  return {
    schemaVersion: 1,
    action,
    sourceCommit: action === 'inspect' ? null : SOURCE,
    project: 'litigant-ai',
    region: 'us-central1',
    service: 'api',
    hostingSite: 'litigant-ai',
    approval: action === 'inspect' ? null : approval(),
  };
}
function successfulRun(overrides = {}) {
  return {
    id: 123456,
    run_attempt: 1,
    head_sha: SOURCE,
    status: 'completed',
    conclusion: 'success',
    path: WORKFLOW,
    event: 'push',
    head_branch: 'main',
    repository: { full_name: REPOSITORY },
    ...overrides,
  };
}
function successfulJobs(name = 'cloud-preflight', overrides = {}) {
  return { jobs: [{ name, status: 'completed', conclusion: 'success', head_sha: SOURCE, run_attempt: 1, ...overrides }] };
}
function hostingConfig() {
  return {
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
    hosting: {
      public: 'artifacts/gh-brain/dist/public',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      headers: [{ source: '**', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }],
      rewrites: [
        { source: '/api-server/**', run: { serviceId: 'api', region: 'us-central1' } },
        { source: '**', destination: '/index.html' },
      ],
    },
  };
}
function service() {
  return {
    apiVersion: 'serving.knative.dev/v1',
    kind: 'Service',
    metadata: {
      name: 'api',
      namespace: 'litigant-ai',
      resourceVersion: '12345',
      annotations: { 'run.googleapis.com/ingress': 'all' },
      labels: { owner: 'lai' },
    },
    spec: {
      template: {
        metadata: {
          name: 'api-00001-test',
          annotations: {
            'autoscaling.knative.dev/maxScale': '10',
            'autoscaling.knative.dev/minScale': '0',
            'run.googleapis.com/vpc-access-connector': 'existing-connector',
          },
        },
        spec: {
          serviceAccountName: 'existing-runtime@litigant-ai.iam.gserviceaccount.com',
          timeoutSeconds: 600,
          containerConcurrency: 80,
          containers: [{
            name: 'api',
            image: IMAGE,
            ports: [{ name: 'http1', containerPort: 8080 }],
            resources: { limits: { cpu: '1', memory: '512Mi' } },
            env: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'APP_DOMAIN', value: 'litigant-ai.com' },
              { name: 'PROVIDER_CONFIG', valueFrom: { secretKeyRef: { name: 'existing-provider-config', key: 'latest' } } },
              { name: 'DEPLOY_GIT_SHA', value: SOURCE },
              { name: 'DEPLOY_TIMESTAMP', value: '2026-10-11T00:00:00Z' },
            ],
          }],
        },
      },
      traffic: [{ latestRevision: true, percent: 100 }],
    },
    status: {
      url: 'https://api-example-uc.a.run.app',
      latestCreatedRevisionName: 'api-00001-test',
      latestReadyRevisionName: 'api-00001-test',
      conditions: [{ type: 'Ready', status: 'True' }],
      traffic: [{ latestRevision: true, percent: 100, revisionName: 'api-00001-test' }],
    },
  };
}

// Descriptor identity and exact-key schema. These fail before any auth or build.
test('initial inspect descriptor accepts the current full controller SHA', () => {
  assert.doesNotThrow(() => validateDescriptor(descriptor(), SOURCE));
});
test('deploy descriptor accepts one pinned source and matching approval', () => {
  const result = validateDescriptor(descriptor('deploy'), DEPLOYMENT);
  assert.equal(result.action, 'deploy');
  assert.equal(result.sourceCommit, SOURCE);
  assert.deepEqual(result.approval, approval());
});
for (const key of Object.keys(descriptor())) {
  test(`descriptor rejects missing ${key}`, () => {
    const d = descriptor(); delete d[key];
    assert.throws(() => validateDescriptor(d, SOURCE));
  });
}
for (const [label, mutate] of [
  ['unknown key', d => { d.allowDeploy = true; }],
  ['unsupported schema', d => { d.schemaVersion = 2; }],
  ['string schema', d => { d.schemaVersion = '1'; }],
  ['unknown action', d => { d.action = 'rollback'; }],
  ['wrong project', d => { d.project = 'other-project'; }],
  ['wrong region', d => { d.region = 'europe-west1'; }],
  ['wrong service', d => { d.service = 'other-api'; }],
  ['wrong hosting site', d => { d.hostingSite = 'other-site'; }],
  ['inspect approval', d => { d.approval = approval(); }],
  ['inspect source override', d => { d.sourceCommit = ENGINE; }],
]) {
  test(`descriptor rejects ${label}`, () => assert.throws(() => validateDescriptor(changed(descriptor(), mutate), SOURCE)));
}
for (const [label, mutate] of [
  ['null source', d => { d.sourceCommit = null; }],
  ['short source', d => { d.sourceCommit = SOURCE.slice(0, 7); }],
  ['symbolic source', d => { d.sourceCommit = 'main'; }],
  ['source with whitespace', d => { d.sourceCommit = ` ${SOURCE}`; }],
  ['source with trailing newline', d => { d.sourceCommit = `${SOURCE}\n`; }],
  ['null approval', d => { d.approval = null; }],
  ['extra approval key', d => { d.approval.actor = 'someone'; }],
  ['missing control pin', d => { delete d.approval.controlSha; }],
  ['mismatched control pin', d => { d.approval.controlSha = DEPLOYMENT; }],
  ['missing preflight', d => { delete d.approval.preflight; }],
  ['extra preflight key', d => { d.approval.preflight.success = true; }],
  ['missing preflight head', d => { delete d.approval.preflight.headSha; }],
  ['mismatched preflight head', d => { d.approval.preflight.headSha = DEPLOYMENT; }],
  ['missing Engine approval', d => { delete d.approval.engine; }],
  ['unapproved Engine repository', d => { d.approval.engine.repository = REPOSITORY; }],
]) {
  test(`deploy descriptor rejects ${label}`, () => assert.throws(() => validateDescriptor(changed(descriptor('deploy'), mutate), DEPLOYMENT)));
}
test('deploy requires a distinct descriptor commit after the approved source', () => {
  assert.throws(() => validateDescriptor(descriptor('deploy'), SOURCE));
});
for (const bad of [null, [], 'inspect', 1]) {
  test(`descriptor rejects non-object ${JSON.stringify(bad)}`, () => assert.throws(() => validateDescriptor(bad, SOURCE)));
}
for (const bad of ['', 'main', SOURCE.slice(0, 7), null]) {
  test(`descriptor rejects invalid controller SHA ${JSON.stringify(bad)}`, () => assert.throws(() => validateDescriptor(descriptor(), bad)));
}

// Engine approval is explicit evidence, never inferred from a repository name.
test('Engine evidence accepts the exact repository and full pinned commit/run/attempt', () => {
  assert.doesNotThrow(() => validateEngineApproval(engineApproval()));
});
for (const key of Object.keys(engineApproval())) {
  test(`Engine evidence rejects missing ${key}`, () => {
    const evidence = engineApproval(); delete evidence[key];
    assert.throws(() => validateEngineApproval(evidence));
  });
}
for (const [label, mutate] of [
  ['extra key', e => { e.approved = true; }],
  ['wrong repository', e => { e.repository = 'other/fluba-designs'; }],
  ['repository URL', e => { e.repository = 'https://github.com/FlubaDesigns/fluba-designs'; }],
  ['short commit', e => { e.commitSha = ENGINE.slice(0, 7); }],
  ['symbolic commit', e => { e.commitSha = 'main'; }],
  ['64-character commit', e => { e.commitSha = 'abcdef0123456789'.repeat(4); }],
  ['zero placeholder commit', e => { e.commitSha = '0'.repeat(40); }],
  ['non-hex commit', e => { e.commitSha = 'g'.repeat(40); }],
  ['commit with trailing newline', e => { e.commitSha = `${ENGINE}\n`; }],
]) {
  test(`Engine evidence rejects ${label}`, () => assert.throws(() => validateEngineApproval(changed(engineApproval(), mutate))));
}
for (const bad of ['', '0', '-1', '1.5', '1e3', ' 123457', '123457 ', '123457\n', '0123457', 123457, null, true]) {
  test(`Engine evidence rejects run ID ${JSON.stringify(bad)}`, () => {
    assert.throws(() => validateEngineApproval({ ...engineApproval(), runId: bad }));
  });
}
for (const bad of [0, -1, 1.5, '1', null, true, Number.MAX_SAFE_INTEGER + 1]) {
  test(`Engine evidence rejects run attempt ${JSON.stringify(bad)}`, () => {
    assert.throws(() => validateEngineApproval({ ...engineApproval(), runAttempt: bad }));
  });
}
for (const bad of ['', '0', '-1', '1.5', '1e3', ' 123456', '123456\n', 123456, null]) {
  test(`preflight approval rejects run ID ${JSON.stringify(bad)}`, () => {
    const d = descriptor('deploy'); d.approval.preflight.runId = bad;
    assert.throws(() => validateDescriptor(d, DEPLOYMENT));
  });
}
for (const bad of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
  test(`preflight approval rejects run attempt ${JSON.stringify(bad)}`, () => {
    const d = descriptor('deploy'); d.approval.preflight.runAttempt = bad;
    assert.throws(() => validateDescriptor(d, DEPLOYMENT));
  });
}

// The deployment commit is a single descriptor-only child of the source commit.
const deploymentCommit = () => ({ parents: [{ sha: SOURCE }] });
const descriptorFiles = () => [{ filename: 'deployment/lai-release.json', status: 'modified' }];
test('deployment child accepts exactly one descriptor modification and one pinned parent', () => {
  assert.doesNotThrow(() => validateDeploymentCommit(deploymentCommit(), descriptorFiles(), SOURCE));
});
for (const [label, commit] of [
  ['missing parents', {}],
  ['root commit', { parents: [] }],
  ['merge commit', { parents: [{ sha: SOURCE }, { sha: ENGINE }] }],
  ['wrong parent', { parents: [{ sha: DEPLOYMENT }] }],
  ['malformed parent', { parents: [{}] }],
]) {
  test(`deployment child rejects ${label}`, () => assert.throws(() => validateDeploymentCommit(commit, descriptorFiles(), SOURCE)));
}
for (const [label, files] of [
  ['empty diff', []],
  ['missing diff', null],
  ['source edit', [{ filename: 'artifacts/api-server/src/index.ts', status: 'modified' }]],
  ['descriptor plus source edit', [...descriptorFiles(), { filename: 'Dockerfile', status: 'modified' }]],
  ['workflow edit', [{ filename: WORKFLOW, status: 'modified' }]],
  ['descriptor added', [{ filename: 'deployment/lai-release.json', status: 'added' }]],
  ['descriptor deleted', [{ filename: 'deployment/lai-release.json', status: 'removed' }]],
  ['descriptor renamed', [{ filename: 'deployment/lai-release.json', status: 'renamed', previous_filename: 'other.json' }]],
  ['lookalike descriptor', [{ filename: 'deployment/../deployment/lai-release.json', status: 'modified' }]],
  ['duplicate descriptor entries', [...descriptorFiles(), ...descriptorFiles()]],
]) {
  test(`deployment child rejects ${label}`, () => assert.throws(() => validateDeploymentCommit(deploymentCommit(), files, SOURCE)));
}

// GitHub run and job data must bind the named workflow to source and attempt.
test('preflight accepts completed successful evidence for the exact pinned run attempt', () => {
  assert.doesNotThrow(() => validatePreflightEvidence(successfulRun(), successfulJobs(), approval()));
});
for (const [label, overrides] of [
  ['wrong run', { id: 123459 }],
  ['rerun after approval', { run_attempt: 2 }],
  ['missing run attempt', { run_attempt: undefined }],
  ['wrong source', { head_sha: DEPLOYMENT }],
  ['wrong repository', { repository: { full_name: 'other/litigant-ai' } }],
  ['missing repository', { repository: undefined }],
  ['wrong branch', { head_branch: 'feature' }],
  ['pull request', { event: 'pull_request' }],
  ['wrong workflow', { path: '.github/workflows/other.yml' }],
  ['incomplete run', { status: 'in_progress' }],
  ['failed run', { conclusion: 'failure' }],
  ['cancelled run', { conclusion: 'cancelled' }],
  ['skipped run', { conclusion: 'skipped' }],
]) {
  test(`preflight rejects ${label}`, () => assert.throws(() => validatePreflightEvidence(successfulRun(overrides), successfulJobs(), approval())));
}
for (const [label, jobs] of [
  ['missing jobs', {}],
  ['empty jobs', { jobs: [] }],
  ['different job', successfulJobs('check-release')],
  ['failed job', successfulJobs('cloud-preflight', { conclusion: 'failure' })],
  ['skipped job', successfulJobs('cloud-preflight', { conclusion: 'skipped' })],
  ['queued job', successfulJobs('cloud-preflight', { status: 'queued' })],
  ['different source job', successfulJobs('cloud-preflight', { head_sha: DEPLOYMENT })],
  ['missing source job', successfulJobs('cloud-preflight', { head_sha: undefined })],
  ['different attempt job', successfulJobs('cloud-preflight', { run_attempt: 2 })],
  ['duplicate jobs', { jobs: [...successfulJobs().jobs, ...successfulJobs().jobs] }],
  ['failed job step', successfulJobs('cloud-preflight', { steps: [{ conclusion: 'failure' }] })],
  ['incomplete job step', successfulJobs('cloud-preflight', { steps: [{ conclusion: null }] })],
]) {
  test(`preflight rejects ${label}`, () => assert.throws(() => validatePreflightEvidence(successfulRun(), jobs, approval())));
}
test('preflight accepts attempt-specific job payload without an optional run_attempt field', () => {
  const jobs = successfulJobs(); delete jobs.jobs[0].run_attempt;
  assert.doesNotThrow(() => validatePreflightEvidence(successfulRun(), jobs, approval()));
});

test('CI selects a successful exact-source release workflow run', () => {
  const run = successfulRun();
  const selected = selectSuccessfulCiRun([successfulRun({ id: 999, head_sha: DEPLOYMENT }), run], SOURCE);
  assert.equal(selected.id, run.id);
});
for (const [label, overrides] of [
  ['wrong SHA', { head_sha: DEPLOYMENT }],
  ['wrong workflow', { path: '.github/workflows/other.yml' }],
  ['wrong repository', { repository: { full_name: 'other/litigant-ai' } }],
  ['wrong branch', { head_branch: 'feature' }],
  ['pull request run', { event: 'pull_request' }],
  ['unfinished run', { status: 'in_progress' }],
  ['failed run', { conclusion: 'failure' }],
  ['skipped run', { conclusion: 'skipped' }],
]) {
  test(`CI refuses ${label} as release evidence`, () => assert.throws(() => selectSuccessfulCiRun([successfulRun(overrides)], SOURCE)));
}
test('CI rejects a newer failed run instead of falling back to older success', () => {
  assert.throws(() => selectSuccessfulCiRun([successfulRun(), successfulRun({ id: 123457, conclusion: 'failure' })], SOURCE));
});
test('CI rejects a newer incomplete run instead of falling back to older success', () => {
  assert.throws(() => selectSuccessfulCiRun([successfulRun(), successfulRun({ id: 123457, status: 'in_progress', conclusion: null })], SOURCE));
});
test('CI accepts the GitHub workflow_runs response shape', () => {
  assert.equal(selectSuccessfulCiRun({ workflow_runs: [successfulRun()] }, SOURCE).id, 123456);
});
test('CI rejects an empty run list', () => assert.throws(() => selectSuccessfulCiRun([], SOURCE)));
test('check-release accepts successful exact-source exact-attempt job', () => {
  assert.doesNotThrow(() => validateCheckJob(successfulJobs('check-release'), SOURCE, 1));
});
for (const [label, jobs] of [
  ['missing job', { jobs: [] }],
  ['wrong job', successfulJobs('cloud-preflight')],
  ['failed job', successfulJobs('check-release', { conclusion: 'failure' })],
  ['skipped job', successfulJobs('check-release', { conclusion: 'skipped' })],
  ['unfinished job', successfulJobs('check-release', { status: 'in_progress' })],
  ['wrong SHA', successfulJobs('check-release', { head_sha: DEPLOYMENT })],
  ['wrong attempt', successfulJobs('check-release', { run_attempt: 2 })],
  ['missing SHA', successfulJobs('check-release', { head_sha: undefined })],
  ['duplicate jobs', { jobs: [...successfulJobs('check-release').jobs, ...successfulJobs('check-release').jobs] }],
]) {
  test(`check-release rejects ${label}`, () => assert.throws(() => validateCheckJob(jobs, SOURCE, 1)));
}

// Only the intended static hosting target can be materialized for publication.
test('Hosting output is hosting-only, pins the site, and preserves headers/rewrites', () => {
  const config = hostingConfig();
  const snapshot = clone(config);
  const output = validateHostingConfig(config);
  assert.deepEqual(output, { hosting: { ...config.hosting, site: 'litigant-ai' } });
  assert.deepEqual(config, snapshot, 'validation must not mutate its input');
  assert.equal(output.firestore, undefined);
});
for (const [label, mutate] of [
  ['missing hosting', c => { delete c.hosting; }],
  ['top-level hook', c => { c.predeploy = ['echo unsafe']; }],
  ['Functions deployment configuration', c => { c.functions = { source: 'firebase-functions' }; }],
  ['Storage deployment configuration', c => { c.storage = { rules: 'storage.rules' }; }],
  ['missing headers', c => { delete c.hosting.headers; }],
  ['missing ignores', c => { delete c.hosting.ignore; }],
  ['non-string ignore', c => { c.hosting.ignore.push({ source: '**' }); }],
  ['hosting array', c => { c.hosting = [c.hosting]; }],
  ['wrong public path', c => { c.hosting.public = '.'; }],
  ['absolute public path', c => { c.hosting.public = '/tmp/public'; }],
  ['path traversal', c => { c.hosting.public = 'artifacts/gh-brain/dist/../../public'; }],
  ['predeploy hook', c => { c.hosting.predeploy = ['echo unsafe']; }],
  ['postdeploy hook', c => { c.hosting.postdeploy = ['echo unsafe']; }],
  ['alternate site', c => { c.hosting.site = 'another-site'; }],
  ['deploy target', c => { c.hosting.target = 'other'; }],
  ['framework backend', c => { c.hosting.frameworksBackend = {}; }],
  ['unknown hosting key', c => { c.hosting.unrecognized = true; }],
  ['missing rewrites', c => { delete c.hosting.rewrites; }],
  ['wrong API service', c => { c.hosting.rewrites[0].run.serviceId = 'other-api'; }],
  ['wrong API region', c => { c.hosting.rewrites[0].run.region = 'europe-west1'; }],
  ['wrong API route', c => { c.hosting.rewrites[0].source = '/other/**'; }],
  ['wrong SPA fallback', c => { c.hosting.rewrites[1].destination = '/other.html'; }],
  ['extra rewrite', c => { c.hosting.rewrites.push({ source: '/secret/**', destination: '/index.html' }); }],
]) {
  test(`Hosting rejects ${label}`, () => assert.throws(() => validateHostingConfig(changed(hostingConfig(), mutate))));
}

// Scope fingerprint detects runtime changes while allowing release provenance.
test('runtime fingerprint allows primary image and deployment provenance to change', () => {
  const before = service();
  const after = changed(before, s => {
    s.spec.template.spec.containers[0].image = `gcr.io/litigant-ai/api@sha256:${'abcdef1234567890'.repeat(4)}`;
    s.spec.template.spec.containers[0].env.find(e => e.name === 'DEPLOY_GIT_SHA').value = DEPLOYMENT;
    s.spec.template.spec.containers[0].env.find(e => e.name === 'DEPLOY_TIMESTAMP').value = '2026-10-12T00:00:00Z';
    s.spec.template.metadata.name = 'api-00002-test';
  });
  assert.deepEqual(runtimeFingerprint(after), runtimeFingerprint(before));
});
test('runtime fingerprint normalizes primary environment ordering', () => {
  const before = service();
  const after = changed(before, s => { s.spec.template.spec.containers[0].env.reverse(); });
  assert.deepEqual(runtimeFingerprint(after), runtimeFingerprint(before));
});
test('runtime fingerprint ignores only known deployment-controlled metadata churn', () => {
  const before = service();
  const after = changed(before, s => {
    s.metadata.resourceVersion = 'new-version';
    s.metadata.annotations['run.googleapis.com/client-name'] = 'gcloud';
    s.metadata.annotations['run.googleapis.com/operation-id'] = 'operation-mock';
    s.spec.template.metadata.annotations['client.knative.dev/nonce'] = 'deployment-nonce-mock';
    s.spec.template.metadata.labels = { 'serving.knative.dev/revision': 'api-00002-test' };
  });
  assert.deepEqual(runtimeFingerprint(after), runtimeFingerprint(before));
});
test('runtime fingerprint does not modify the supplied service object', () => {
  const input = service(); const snapshot = clone(input);
  runtimeFingerprint(input);
  assert.deepEqual(input, snapshot);
});
for (const [label, mutate] of [
  ['service runtime label', s => { s.metadata.labels.owner = 'other'; }],
  ['template runtime label', s => { s.spec.template.metadata.labels = { runtime: 'other' }; }],
  ['ordinary environment value', s => { s.spec.template.spec.containers[0].env[1].value = 'other.example'; }],
  ['environment removal', s => { s.spec.template.spec.containers[0].env.splice(0, 1); }],
  ['new environment entry', s => { s.spec.template.spec.containers[0].env.push({ name: 'NEW_SETTING', value: 'true' }); }],
  ['similarly named environment', s => { s.spec.template.spec.containers[0].env.push({ name: 'DEPLOY_GIT_SHA_EXTRA', value: SOURCE }); }],
  ['secret reference name', s => { s.spec.template.spec.containers[0].env[2].valueFrom.secretKeyRef.name = 'other-secret'; }],
  ['secret reference version', s => { s.spec.template.spec.containers[0].env[2].valueFrom.secretKeyRef.key = '1'; }],
  ['runtime identity', s => { s.spec.template.spec.serviceAccountName = 'other@litigant-ai.iam.gserviceaccount.com'; }],
  ['ingress', s => { s.metadata.annotations['run.googleapis.com/ingress'] = 'internal'; }],
  ['VPC connector', s => { s.spec.template.metadata.annotations['run.googleapis.com/vpc-access-connector'] = 'other-connector'; }],
  ['autoscaling', s => { s.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'] = '20'; }],
  ['runtime port', s => { s.spec.template.spec.containers[0].ports[0].containerPort = 9090; }],
  ['CPU limit', s => { s.spec.template.spec.containers[0].resources.limits.cpu = '2'; }],
  ['memory limit', s => { s.spec.template.spec.containers[0].resources.limits.memory = '1Gi'; }],
  ['request timeout', s => { s.spec.template.spec.timeoutSeconds = 300; }],
  ['concurrency', s => { s.spec.template.spec.containerConcurrency = 10; }],
  ['traffic routing', s => { s.spec.traffic = [{ revisionName: 'api-00000-old', percent: 100 }]; }],
  ['traffic tag', s => { s.spec.traffic[0].tag = 'preview'; }],
  ['new sidecar', s => { s.spec.template.spec.containers.push({ name: 'sidecar', image: 'example.invalid/sidecar:1' }); }],
]) {
  test(`runtime fingerprint detects ${label} drift`, () => {
    const before = service();
    assert.notDeepEqual(runtimeFingerprint(changed(before, mutate)), runtimeFingerprint(before));
  });
}
test('runtime fingerprint preserves existing sidecar image and environment', () => {
  const before = service();
  before.spec.template.spec.containers.push({ name: 'sidecar', image: 'example.invalid/sidecar:1', env: [{ name: 'SIDE_SETTING', value: '1' }, { name: 'DEPLOY_GIT_SHA', value: SOURCE }] });
  const afterImage = changed(before, s => { s.spec.template.spec.containers[1].image = 'example.invalid/sidecar:2'; });
  const afterEnv = changed(before, s => { s.spec.template.spec.containers[1].env[0].value = '2'; });
  assert.notDeepEqual(runtimeFingerprint(afterImage), runtimeFingerprint(before));
  assert.notDeepEqual(runtimeFingerprint(afterEnv), runtimeFingerprint(before));
  const afterSidecarProvenance = changed(before, s => { s.spec.template.spec.containers[1].env[1].value = ENGINE; });
  assert.notDeepEqual(runtimeFingerprint(afterSidecarProvenance), runtimeFingerprint(before));
});

// Existing service must be fully ready with one unambiguous active revision.
test('service readiness accepts the intended ready latest-revision service', () => assert.doesNotThrow(() => assertServiceReady(service())));
test('service readiness accepts the existing numeric project namespace', () => {
  const numeric = changed(service(), s => { s.metadata.namespace = '781960492360'; });
  assert.doesNotThrow(() => assertServiceReady(numeric));
});
for (const [label, mutate] of [
  ['wrong API version', s => { s.apiVersion = 'run.googleapis.com/v2'; }],
  ['wrong kind', s => { s.kind = 'Job'; }],
  ['wrong name', s => { s.metadata.name = 'other'; }],
  ['wrong namespace', s => { s.metadata.namespace = 'other-project'; }],
  ['wrong region', s => { s.metadata.labels['cloud.googleapis.com/location'] = 'europe-west1'; }],
  ['missing resource version', s => { delete s.metadata.resourceVersion; }],
  ['non-string resource version', s => { s.metadata.resourceVersion = 12345; }],
  ['empty resource version', s => { s.metadata.resourceVersion = ''; }],
  ['existing sidecar', s => { s.spec.template.spec.containers.push({ name: 'sidecar', image: 'example.invalid/sidecar:1' }); }],
  ['missing runtime identity', s => { delete s.spec.template.spec.serviceAccountName; }],
  ['missing primary image', s => { delete s.spec.template.spec.containers[0].image; }],
  ['unexpected service URL', s => { s.status.url = 'https://unrelated.example'; }],
  ['desired pinned revision traffic', s => { s.spec.traffic = [{ revisionName: 'api-00001-test', percent: 100 }]; }],
  ['tagged status traffic', s => { s.status.traffic[0].tag = 'preview'; }],
  ['missing status', s => { delete s.status; }],
  ['missing ready condition', s => { s.status.conditions = []; }],
  ['not ready', s => { s.status.conditions[0].status = 'False'; }],
  ['unknown readiness', s => { s.status.conditions[0].status = 'Unknown'; }],
  ['unready new revision', s => { s.status.latestCreatedRevisionName = 'api-00002-test'; }],
  ['missing latest revision', s => { delete s.status.latestReadyRevisionName; }],
  ['empty traffic', s => { s.status.traffic = []; }],
  ['split traffic', s => { s.status.traffic = [{ ...s.status.traffic[0], percent: 90 }, { percent: 10, revisionName: 'api-00000-old' }]; }],
  ['partial traffic', s => { s.status.traffic[0].percent = 99; }],
  ['string traffic percent', s => { s.status.traffic[0].percent = '100'; }],
  ['nonlatest traffic', s => { s.status.traffic[0].latestRevision = false; }],
  ['wrong active revision', s => { s.status.traffic[0].revisionName = 'api-00000-old'; }],
]) {
  test(`service readiness rejects ${label}`, () => assert.throws(() => assertServiceReady(changed(service(), mutate))));
}

// Image selection cannot redirect the deployment to another project/repository.
test('image guard accepts only an immutable digest in the approved image repository', () => assert.doesNotThrow(() => assertAllowedImage(IMAGE)));
for (const bad of [
  'gcr.io/litigant-ai/api:latest',
  `gcr.io/litigant-ai/api:${SOURCE}`,
  `gcr.io/other-project/api@sha256:${'a'.repeat(64)}`,
  `gcr.io/litigant-ai/other@sha256:${'a'.repeat(64)}`,
  `us-docker.pkg.dev/litigant-ai/api/image@sha256:${'a'.repeat(64)}`,
  `https://${IMAGE}`,
  `${IMAGE} `,
  `${IMAGE}\n`,
  'gcr.io/litigant-ai/api@sha256:abc123',
  `gcr.io/litigant-ai/api@sha256:${'g'.repeat(64)}`,
  '',
  null,
]) {
  test(`image guard rejects ${JSON.stringify(bad)}`, () => assert.throws(() => assertAllowedImage(bad)));
}

test('runtime fingerprint ignores gcloud nonce in template labels and annotations', () => {
  const before = service();
  const after = structuredClone(before);
  after.spec.template.metadata.labels = { ...(after.spec.template.metadata.labels ?? {}), 'client.knative.dev/nonce': 'new-nonce' };
  after.spec.template.metadata.annotations = { ...(after.spec.template.metadata.annotations ?? {}), 'client.knative.dev/nonce': 'new-nonce' };
  assert.equal(runtimeFingerprint(before), runtimeFingerprint(after));
});

test('runtime fingerprint normalizes missing and empty metadata but preserves real labels', () => {
  const before = service();
  delete before.spec.template.metadata;
  const after = structuredClone(before);
  after.spec.template.metadata = { labels: {}, annotations: {} };
  assert.equal(runtimeFingerprint(before), runtimeFingerprint(after));
  after.spec.template.metadata.labels['app.example.com/runtime-mode'] = 'changed';
  assert.notEqual(runtimeFingerprint(before), runtimeFingerprint(after));
});


test('read-only retry stops after recovery without a real sleep', async () => {
  const { retryRead } = await import('./lai-release.mjs');
  let calls = 0; let waits = 0;
  const result = await retryRead(async () => { if (++calls < 3) throw new Error('propagating'); return 'ready'; }, { attempts: 3, delayMs: 0, pause: async () => { waits++; } });
  assert.equal(result, 'ready'); assert.equal(calls, 3); assert.equal(waits, 2);
});

test('read-only retry preserves terminal failure and respects its bound', async () => {
  const { retryRead } = await import('./lai-release.mjs');
  let calls = 0; let waits = 0;
  await assert.rejects(retryRead(async () => { calls++; throw new Error('still stale'); }, { attempts: 2, delayMs: 0, pause: async () => { waits++; } }), /still stale/);
  assert.equal(calls, 2); assert.equal(waits, 1);
  await assert.rejects(retryRead(async () => {}, { attempts: 13 }), /invalid read retry bound/);
});
