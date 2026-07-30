# Baseline protection

## Frozen baseline

- Release/tag: `v2.0.0-baseline`
- Commit: `43c9c2caa237e326e08671606d4b3b5aa117e5ec`
- Source archive SHA-256: `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e`
- Baseline verification: install → lint → typecheck → build → test

The tag must always resolve to the commit above. Do not retag or overwrite the release. Future source checks read the original UI hashes from the frozen tag rather than requiring current product files to remain unchanged.

## Main branch policy

Every product or infrastructure change must use a branch and pull request. The intended `main` protection rule is:

- require the `verify` status check and require the branch to be current;
- require changes through a pull request;
- enforce the rule for administrators;
- require linear history;
- block force pushes and branch deletion;
- require conversation resolution.

This repository is owned by one person, so the rule intentionally uses zero required approving reviews. CI and unresolved review conversations remain mandatory gates.

If automated protection setup is denied by GitHub, keep the generated P0 issue open and follow this PR-only policy manually until an owner applies the rule in repository settings.

## Rollback

The baseline is a reference and rollback point, not a deployment command. Before rollback:

1. identify whether the problem is code, schema, data, identity, or deployment configuration;
2. preserve current data and logs;
3. verify the target database schema is compatible with the baseline;
4. create a rollback PR or deploy the exact baseline commit through the controlled deployment process;
5. record the rollback evidence and follow-up repair issue.
