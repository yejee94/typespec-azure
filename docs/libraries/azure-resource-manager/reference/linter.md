---
title: "Linter usage"
toc_min_heading_level: 2
toc_max_heading_level: 3
---

# Linter

## Usage

Add the following in `tspconfig.yaml`:

```yaml
linter:
  extends:
    - "@azure-tools/typespec-azure-resource-manager/all"
```

## RuleSets

Available ruleSets:

- [`@azure-tools/typespec-azure-resource-manager/all`](#@azure-tools/typespec-azure-resource-manager/all)

## Rules

| Name                                                                                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`@azure-tools/typespec-azure-resource-manager/arm-no-record`](/libraries/azure-resource-manager/rules/no-record.md)                           | Don't use Record types for ARM resources.                                          |
| `@azure-tools/typespec-azure-resource-manager/arm-common-types-version`                                                                        | Specify the ARM common-types version using @armCommonTypesVersion.                 |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-action-no-segment`                                                                  | `@armResourceAction` should not be used with `@segment`.                           |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-duplicate-property`                                                                 | Warn about duplicate properties in resources.                                      |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-invalid-envelope-property`                                                          | Check for invalid resource envelope properties.                                    |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-invalid-version-format`                                                             | Check for valid versions.                                                          |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-key-invalid-chars`                                                                  | Arm resource key must contain only alphanumeric characters.                        |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-operation-response`                                                                 | [RPC 008]: PUT, GET, PATCH & LIST must return the same resource schema.            |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-path-segment-invalid-chars`                                                         | Arm resource name must contain only alphanumeric characters.                       |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-provisioning-state`                                                                 | Check for properly configured provisioningState property.                          |
| `@azure-tools/typespec-azure-resource-manager/beyond-nesting-levels`                                                                           | Tracked Resources must use 3 or fewer levels of nesting.                           |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-operation`                                                                          | Validate ARM Resource operations.                                                  |
| `@azure-tools/typespec-azure-resource-manager/no-resource-delete-operation`                                                                    | Check for resources that must have a delete operation.                             |
| `@azure-tools/typespec-azure-resource-manager/empty-updateable-properties`                                                                     | Should have updateable properties.                                                 |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-interface-requires-decorator`                                                       | Each resource interface must have an @armResourceOperations decorator.             |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-invalid-action-verb`                                                                | Actions must be HTTP Post operations.                                              |
| `@azure-tools/typespec-azure-resource-manager/improper-subscription-list-operation`                                                            | Tenant and Extension resources should not define a list by subscription operation. |
| [`@azure-tools/typespec-azure-resource-manager/missing-x-ms-identifiers`](/libraries/azure-resource-manager/rules/missing-x-ms-identifiers.md) | Azure services should not use enums.                                               |
| `@azure-tools/typespec-azure-resource-manager/no-response-body`                                                                                | The body of 202 response should be empty.                                          |
| `@azure-tools/typespec-azure-resource-manager/missing-operations-endpoint`                                                                     | Check for missing Operations interface.                                            |
| `@azure-tools/typespec-azure-resource-manager/patch-envelope`                                                                                  | Patch envelope properties should match the resource properties.                    |
| `@azure-tools/typespec-azure-resource-manager/arm-resource-patch`                                                                              | Validate ARM PATCH operations.                                                     |
| `@azure-tools/typespec-azure-resource-manager/resource-name`                                                                                   | Check the resource name.                                                           |
| `@azure-tools/typespec-azure-resource-manager/retry-after`                                                                                     | Check if retry-after header appears in response body.                              |
| [`@azure-tools/typespec-azure-resource-manager/unsupported-type`](/libraries/azure-resource-manager/rules/unsupported-type.md)                 | Check for unsupported ARM types.                                                   |
