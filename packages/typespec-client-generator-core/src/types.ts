import {
  UnionEnum,
  getLroMetadata,
  getUnionAsEnum,
  isFixed,
} from "@azure-tools/typespec-azure-core";
import {
  BooleanLiteral,
  BytesKnownEncoding,
  DateTimeKnownEncoding,
  Diagnostic,
  DurationKnownEncoding,
  Enum,
  EnumMember,
  IntrinsicType,
  Model,
  ModelProperty,
  NumericLiteral,
  Operation,
  Scalar,
  StringLiteral,
  Tuple,
  Type,
  Union,
  UsageFlags,
  createDiagnosticCollector,
  getDiscriminator,
  getEncode,
  getFormat,
  getKnownValues,
  getVisibility,
  ignoreDiagnostics,
  isNeverType,
  isNullType,
} from "@typespec/compiler";
import {
  Visibility,
  getHttpOperation,
  getServers,
  isHeader,
  isPathParam,
  isQueryParam,
  isStatusCode,
} from "@typespec/http";
import { getAddedOnVersions, getRemovedOnVersions, getVersions } from "@typespec/versioning";
import {
  getAccessOverride,
  getUsageOverride,
  isExclude,
  isInclude,
  isInternal,
  listClients,
  listOperationGroups,
  listOperationsInOperationGroup,
  shouldFlattenProperty,
  shouldGenerateConvenient,
} from "./decorators.js";
import {
  SdkArrayType,
  SdkBodyModelPropertyType,
  SdkBuiltInKinds,
  SdkBuiltInType,
  SdkConstantType,
  SdkDatetimeType,
  SdkDictionaryType,
  SdkDurationType,
  SdkEnumType,
  SdkEnumValueType,
  SdkModelPropertyTypeBase,
  SdkModelType,
  SdkTupleType,
  SdkType,
} from "./interfaces.js";
import { createDiagnostic } from "./lib.js";
import {
  getCrossLanguageDefinitionId,
  getDocHelper,
  getEffectivePayloadType,
  getGeneratedName,
  getLibraryName,
  getPropertyNames,
  getSdkTypeBaseHelper,
  intOrFloat,
  isAzureCoreModel,
  isErrorOrChildOfError,
} from "./public-utils.js";

import { TCGCContext } from "./internal-utils.js";

function getAnyType(context: TCGCContext, type: Type): SdkBuiltInType {
  return {
    ...getSdkTypeBaseHelper(context, type, "any"),
    encode: getEncodeHelper(context, type, "any"),
  };
}

function getEncodeHelper(context: TCGCContext, type: Type, kind: string): string {
  if (type.kind === "ModelProperty" || type.kind === "Scalar") {
    return getEncode(context.program, type)?.encoding || kind;
  }
  return kind;
}

/**
 * Add format info onto an sdk type. Since the format decorator
 * decorates the ModelProperty, we add the format info onto the property's internal
 * type.
 * @param context sdk context
 * @param type the original typespec type. Used to grab the format decorator off of
 * @param propertyType the type of the property, i.e. the internal type that we add the format info onto
 */
function addFormatInfo(
  context: TCGCContext,
  type: ModelProperty | Scalar,
  propertyType: SdkType
): void {
  const format = getFormat(context.program, type)?.toLocaleLowerCase();
  if (format) {
    switch (format) {
      case "guid":
      case "uuid":
      case "password":
      case "etag":
        propertyType.kind = format;
        break;
      case "url":
      case "uri":
        propertyType.kind = "url";
        break;
      case "armid":
        propertyType.kind = "armId";
        break;
      case "ipaddress":
        propertyType.kind = "ipAddress";
        break;
      case "azurelocation":
        propertyType.kind = "azureLocation";
        break;
      default:
        break;
    }
  }
}

/**
 * Add encoding info onto an sdk type. Since the encoding decorator
 * decorates the ModelProperty, we add the encoding info onto the property's internal
 * type.
 * @param context sdk context
 * @param type the original typespec type. Used to grab the encoding decorator off of
 * @param propertyType the type of the property, i.e. the internal type that we add the encoding info onto
 */
function addEncodeInfo(
  context: TCGCContext,
  type: ModelProperty | Scalar,
  propertyType: SdkType
): [void, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  const encodeData = getEncode(context.program, type);
  if (propertyType.kind === "duration") {
    if (!encodeData) return diagnostics.wrap(undefined);
    propertyType.encode = encodeData.encoding as DurationKnownEncoding;
    propertyType.wireType = diagnostics.pipe(
      getClientTypeWithDiagnostics(context, encodeData.type)
    ) as SdkBuiltInType;
  }
  if (propertyType.kind === "utcDateTime" || propertyType.kind === "offsetDateTime") {
    if (encodeData) {
      propertyType.encode = encodeData.encoding as DateTimeKnownEncoding;
      propertyType.wireType = diagnostics.pipe(
        getClientTypeWithDiagnostics(context, encodeData.type)
      ) as SdkBuiltInType;
    } else if (type.kind === "ModelProperty" && isHeader(context.program, type)) {
      propertyType.encode = "rfc7231";
    }
  }
  if (propertyType.kind === "bytes") {
    if (encodeData) {
      propertyType.encode = encodeData.encoding as BytesKnownEncoding;
    } else {
      propertyType.encode = "base64";
    }
  }
  return diagnostics.wrap(undefined);
}

/**
 * Mapping of typespec scalar kinds to the built in kinds exposed in the SDK
 * @param scalar the original typespec scalar
 * @returns the corresponding sdk built in kind
 */
function getScalarKind(scalar: Scalar): SdkBuiltInKinds {
  switch (scalar.name) {
    case "int8":
    case "int16":
    case "int32":
    case "int64":
    case "uint8":
    case "uint16":
    case "uint32":
    case "uint64":
    case "numeric":
    case "integer":
    case "safeint":
    case "decimal128":
    case "bytes":
    case "float":
    case "float32":
    case "float64":
    case "boolean":
    case "string":
    case "url":
    case "decimal":
    case "plainDate":
    case "plainTime":
      return scalar.name;
    default:
      throw Error(`Unknown scalar kind ${scalar.name}`);
  }
}

/**
 * Get the sdk built in type for a given typespec type
 * @param context the sdk context
 * @param type the typespec type
 * @returns the corresponding sdk type
 */
export function getSdkBuiltInType(
  context: TCGCContext,
  type: Scalar | IntrinsicType | NumericLiteral | StringLiteral | BooleanLiteral
): SdkBuiltInType {
  if (context.program.checker.isStdType(type) || type.kind === "Intrinsic") {
    let kind: SdkBuiltInKinds = "any";
    if (type.kind === "Scalar") {
      kind = getScalarKind(type);
    }
    return {
      ...getSdkTypeBaseHelper(context, type, kind),
      encode: getEncodeHelper(context, type, kind),
    };
  } else if (type.kind === "String" || type.kind === "Boolean" || type.kind === "Number") {
    let kind: SdkBuiltInKinds;

    if (type.kind === "String") {
      kind = "string";
    } else if (type.kind === "Boolean") {
      kind = "boolean";
    } else {
      kind = intOrFloat(type.value);
    }
    return {
      ...getSdkTypeBaseHelper(context, type, kind),
      encode: getEncodeHelper(context, type, kind),
    };
  }
  throw Error(`Unknown kind ${type.kind}`);
}

export function getSdkDurationType(context: TCGCContext, type: Scalar): SdkDurationType {
  // we don't get encode info until we get to the property / parameter level
  // so we insert the default. Later in properties, we will check
  // for encoding info and override accordingly
  return {
    ...getSdkTypeBaseHelper(context, type, "duration"),
    encode: "ISO8601",
    wireType: { ...getSdkTypeBaseHelper(context, type, "string"), encode: "string" },
  };
}

export function getSdkArrayOrDict(
  context: TCGCContext,
  type: Model,
  operation?: Operation
): (SdkDictionaryType | SdkArrayType) | undefined {
  return ignoreDiagnostics(getSdkArrayOrDictWithDiagnostics(context, type, operation));
}

export function getSdkArrayOrDictWithDiagnostics(
  context: TCGCContext,
  type: Model,
  operation?: Operation
): [(SdkDictionaryType | SdkArrayType) | undefined, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  if (type.indexer !== undefined) {
    if (!isNeverType(type.indexer.key)) {
      const valueType = diagnostics.pipe(
        getClientTypeWithDiagnostics(context, type.indexer.value!, operation)
      );
      const name = type.indexer.key.name;
      if (name === "string") {
        // model MyModel is Record<> {} should be model with additional properties
        if (type.sourceModel?.kind === "Model" && type.sourceModel?.name === "Record") {
          return diagnostics.wrap(undefined);
        }
        return diagnostics.wrap({
          ...getSdkTypeBaseHelper(context, type, "dict"),
          keyType: diagnostics.pipe(
            getClientTypeWithDiagnostics(context, type.indexer.key, operation)
          ),
          valueType,
        });
      } else if (name === "integer") {
        return diagnostics.wrap({
          ...getSdkTypeBaseHelper(context, type, "array"),
          valueType,
        });
      }
    }
  }
  return diagnostics.wrap(undefined);
}

export function getSdkTuple(
  context: TCGCContext,
  type: Tuple,
  operation?: Operation
): SdkTupleType {
  return ignoreDiagnostics(getSdkTupleWithDiagnostics(context, type, operation));
}

export function getSdkTupleWithDiagnostics(
  context: TCGCContext,
  type: Tuple,
  operation?: Operation
): [SdkTupleType, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  return diagnostics.wrap({
    ...getSdkTypeBaseHelper(context, type, "tuple"),
    values: type.values.map((x) =>
      diagnostics.pipe(getClientTypeWithDiagnostics(context, x, operation))
    ),
  });
}

function getNonNullOptions(context: TCGCContext, type: Union): Type[] {
  return [...type.variants.values()].map((x) => x.type).filter((t) => !isNullType(t));
}

export function getSdkUnion(context: TCGCContext, type: Union, operation?: Operation): SdkType {
  return ignoreDiagnostics(getSdkUnionWithDiagnostics(context, type, operation));
}

export function getSdkUnionWithDiagnostics(
  context: TCGCContext,
  type: Union,
  operation?: Operation
): [SdkType, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  const nonNullOptions = getNonNullOptions(context, type);
  if (nonNullOptions.length === 0) {
    diagnostics.add(createDiagnostic({ code: "union-null", target: type }));
    return diagnostics.wrap(getAnyType(context, type));
  }

  // change to a simple logic: only convert to normal type if the union is type | null, otherwise, return all the union types
  if (nonNullOptions.length === 1) {
    const clientType = diagnostics.pipe(
      getClientTypeWithDiagnostics(context, nonNullOptions[0], operation)
    );
    clientType.nullable = true;
    return diagnostics.wrap(clientType);
  }

  const unionAsEnum = diagnostics.pipe(getUnionAsEnum(type));
  if (unionAsEnum) {
    return diagnostics.wrap(getSdkUnionEnum(context, unionAsEnum, operation));
  }

  return diagnostics.wrap({
    ...getSdkTypeBaseHelper(context, type, "union"),
    name: getLibraryName(context, type),
    generatedName: type.name ? undefined : getGeneratedName(context, type),
    values: nonNullOptions.map((x) =>
      diagnostics.pipe(getClientTypeWithDiagnostics(context, x, operation))
    ),
    nullable: nonNullOptions.length < type.variants.size,
  });
}

export function getSdkConstant(
  context: TCGCContext,
  type: StringLiteral | NumericLiteral | BooleanLiteral
): SdkConstantType {
  switch (type.kind) {
    case "Number":
    case "String":
    case "Boolean":
      const valueType = getSdkBuiltInType(context, type);
      return {
        ...getSdkTypeBaseHelper(context, type, "constant"),
        value: type.value,
        valueType,
      };
  }
}

function addDiscriminatorToModelType(
  context: TCGCContext,
  type: Model,
  model: SdkModelType,
  operation?: Operation
): [undefined, readonly Diagnostic[]] {
  const discriminator = getDiscriminator(context.program, type);
  const diagnostics = createDiagnosticCollector();
  if (discriminator) {
    let discriminatorProperty;
    for (const childModel of type.derivedModels) {
      const childModelSdkType = diagnostics.pipe(
        getSdkModelWithDiagnostics(context, childModel, operation)
      );
      updateModelsMap(context, childModel, childModelSdkType, operation);
      for (const property of childModelSdkType.properties) {
        if (property.kind === "property") {
          if (property.serializedName === discriminator?.propertyName) {
            if (property.type.kind !== "constant" && property.type.kind !== "enumvalue") {
              diagnostics.add(
                createDiagnostic({
                  code: "discriminator-not-constant",
                  target: type,
                  format: { discriminator: property.nameInClient },
                })
              );
            } else if (typeof property.type.value !== "string") {
              diagnostics.add(
                createDiagnostic({
                  code: "discriminator-not-string",
                  target: type,
                  format: {
                    discriminator: property.nameInClient,
                    discriminatorValue: String(property.type.value),
                  },
                })
              );
            } else {
              childModelSdkType.discriminatorValue = property.type.value;
              property.discriminator = true;
              if (model.discriminatedSubtypes === undefined) {
                model.discriminatedSubtypes = {};
              }
              model.discriminatedSubtypes[property.type.value] = childModelSdkType;
              discriminatorProperty = property;
            }
          }
        }
      }
    }
    for (let i = 0; i < model.properties.length; i++) {
      const property = model.properties[i];
      if (property.kind === "property" && property.serializedName === discriminator.propertyName) {
        property.discriminator = true;
        return diagnostics.wrap(undefined);
      }
    }
    let discriminatorType: SdkType;
    if (discriminatorProperty) {
      if (discriminatorProperty.type.kind === "constant") {
        discriminatorType = { ...discriminatorProperty.type.valueType };
      } else if (discriminatorProperty.type.kind === "enumvalue") {
        discriminatorType = discriminatorProperty.type.enumType;
      }
    } else {
      discriminatorType = {
        nullable: false,
        kind: "string",
        encode: "string",
      };
    }
    model.properties.push({
      kind: "property",
      optional: false,
      discriminator: true,
      serializedName: discriminator.propertyName,
      type: discriminatorType!,
      nameInClient: discriminator.propertyName,
      apiVersions: getAvailableApiVersions(context, model.__raw!),
      isMultipartFileInput: false, // discriminator property cannot be a file
      flatten: false, // discriminator properties can not be flattened
    });
  }
  return diagnostics.wrap(undefined);
}

export function getSdkModel(
  context: TCGCContext,
  type: Model,
  operation?: Operation
): SdkModelType {
  return ignoreDiagnostics(getSdkModelWithDiagnostics(context, type, operation));
}

export function getSdkModelWithDiagnostics(
  context: TCGCContext,
  type: Model,
  operation?: Operation
): [SdkModelType, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  type = getEffectivePayloadType(context, type);
  let sdkType = context.modelsMap?.get(type) as SdkModelType | undefined;
  const httpOperation = operation
    ? ignoreDiagnostics(getHttpOperation(context.program, operation))
    : undefined;
  const httpBody = httpOperation?.parameters.body;
  let isFormDataType = false;
  if (httpBody && httpBody.type.kind === "Model") {
    const isMultipartOperation = httpBody.contentTypes.some((x) => x.startsWith("multipart/"));
    isFormDataType =
      isMultipartOperation && getEffectivePayloadType(context, httpBody.type) === type;
  }
  if (sdkType) {
    updateModelsMap(context, type, sdkType, operation);
    if (httpOperation && isFormDataType !== sdkType.isFormDataType) {
      // This means we have a model that is used both for formdata input and for regular body input
      diagnostics.add(
        createDiagnostic({
          code: "conflicting-multipart-model-usage",
          target: type,
          format: {
            modelName: sdkType.name,
          },
        })
      );
    }
  } else {
    const docWrapper = getDocHelper(context, type);
    sdkType = {
      ...getSdkTypeBaseHelper(context, type, "model"),
      name: getLibraryName(context, type),
      generatedName: type.name === "" ? getGeneratedName(context, type) : undefined,
      description: docWrapper.description,
      details: docWrapper.details,
      properties: [],
      additionalProperties: undefined, // going to set additional properties in the next few lines when we look at base model
      access: undefined, // dummy value since we need to update models map before we can set this
      usage: UsageFlags.None, // dummy value since we need to update models map before we can set this
      crossLanguageDefinitionId: getCrossLanguageDefinitionId(type),
      isFormDataType,
      isError: isErrorOrChildOfError(context, type),
    };

    updateModelsMap(context, type, sdkType, operation);
    // model MyModel is Record<> {} should be model with additional properties
    if (type.sourceModel?.kind === "Model" && type.sourceModel?.name === "Record") {
      sdkType.additionalProperties = diagnostics.pipe(
        getClientTypeWithDiagnostics(context, type.sourceModel!.indexer!.value!, operation)
      );
    }
    if (type.baseModel) {
      sdkType.baseModel = context.modelsMap?.get(type.baseModel) as SdkModelType | undefined;
      if (sdkType.baseModel === undefined) {
        const baseModel = diagnostics.pipe(
          getClientTypeWithDiagnostics(context, type.baseModel, operation)
        ) as SdkDictionaryType | SdkModelType;
        if (baseModel.kind === "dict") {
          // model MyModel extends Record<> {} should be model with additional properties
          sdkType.additionalProperties = baseModel.valueType;
        } else {
          sdkType.baseModel = baseModel;
          updateModelsMap(context, type.baseModel, sdkType.baseModel, operation);
        }
      }
    }
    diagnostics.pipe(addPropertiesToModelType(context, type, sdkType, operation));
    diagnostics.pipe(addDiscriminatorToModelType(context, type, sdkType, operation));
  }
  return diagnostics.wrap(sdkType);
}

function getSdkEnumValueType(
  context: TCGCContext,
  type: EnumMember | StringLiteral | NumericLiteral
): SdkBuiltInType {
  let kind: "string" | "int32" | "float32" = "string";
  if (typeof type.value === "number") {
    kind = intOrFloat(type.value);
  }
  return {
    ...getSdkTypeBaseHelper(context, type, kind),
    encode: kind,
  };
}

export function getSdkEnumValue(
  context: TCGCContext,
  enumType: SdkEnumType,
  type: EnumMember
): SdkEnumValueType {
  const docWrapper = getDocHelper(context, type);
  return {
    ...getSdkTypeBaseHelper(context, type, "enumvalue"),
    name: getLibraryName(context, type),
    value: type.value ?? type.name,
    description: docWrapper.description,
    details: docWrapper.details,
    enumType,
    valueType: enumType.valueType,
  };
}

export function getSdkEnum(context: TCGCContext, type: Enum, operation?: Operation): SdkEnumType {
  let sdkType = context.modelsMap?.get(type) as SdkEnumType | undefined;
  if (!sdkType) {
    const docWrapper = getDocHelper(context, type);
    sdkType = {
      ...getSdkTypeBaseHelper(context, type, "enum"),
      name: getLibraryName(context, type),
      description: docWrapper.description,
      details: docWrapper.details,
      valueType: getSdkEnumValueType(context, type.members.values().next().value),
      values: [],
      isFixed: isFixed(context.program, type),
      isFlags: false,
      usage: UsageFlags.None, // We will add usage as we loop through the operations
      access: undefined, // Dummy value until we update models map
      crossLanguageDefinitionId: getCrossLanguageDefinitionId(type),
    };
    for (const member of type.members.values()) {
      sdkType.values.push(getSdkEnumValue(context, sdkType, member));
    }
  }
  updateModelsMap(context, type, sdkType, operation);
  return sdkType;
}

function getSdkUnionEnumValues(
  context: TCGCContext,
  type: UnionEnum,
  enumType: SdkEnumType
): SdkEnumValueType[] {
  const values: SdkEnumValueType[] = [];
  for (const member of type.flattenedMembers.values()) {
    const docWrapper = getDocHelper(context, member.type);
    const name = getLibraryName(context, member.type);
    values.push({
      kind: "enumvalue",
      name: name ? name : `${member.value}`,
      description: docWrapper.description,
      details: docWrapper.details,
      value: member.value,
      valueType: enumType.valueType,
      enumType,
      nullable: false,
    });
  }
  return values;
}

function getSdkUnionEnum(context: TCGCContext, type: UnionEnum, operation?: Operation) {
  let sdkType = context.modelsMap?.get(type.union) as SdkEnumType | undefined;
  if (!sdkType) {
    const union = type.union as Union & { name: string };
    const docWrapper = getDocHelper(context, union);
    sdkType = {
      ...getSdkTypeBaseHelper(context, type.union, "enum"),
      name: getLibraryName(context, type.union),
      generatedName: type.union.name ? undefined : getGeneratedName(context, type.union),
      description: docWrapper.description,
      details: docWrapper.details,
      valueType: getSdkEnumValueType(context, type.flattenedMembers.values().next().value),
      values: [],
      nullable: type.nullable,
      isFixed: !type.open,
      isFlags: false,
      usage: UsageFlags.None, // We will add usage as we loop through the operations
      access: undefined, // Dummy value until we update models map
      crossLanguageDefinitionId: getCrossLanguageDefinitionId(union),
    };
    sdkType.values = getSdkUnionEnumValues(context, type, sdkType);
  }
  updateModelsMap(context, type.union, sdkType, operation);
  return sdkType;
}

function getKnownValuesEnum(
  context: TCGCContext,
  type: Scalar | ModelProperty,
  operation?: Operation
): SdkEnumType | undefined {
  const knownValues = getKnownValues(context.program, type);
  if (!knownValues) {
    return;
  }
  if (type.kind === "ModelProperty") {
    const sdkType = getSdkEnum(context, knownValues, operation);
    return sdkType;
  } else {
    let sdkType = context.modelsMap?.get(type) as SdkEnumType | undefined;
    if (!sdkType) {
      const docWrapper = getDocHelper(context, type);
      sdkType = {
        ...getSdkTypeBaseHelper(context, type, "enum"),
        name: getLibraryName(context, type),
        description: docWrapper.description,
        details: docWrapper.details,
        valueType: getSdkEnumValueType(context, knownValues.members.values().next().value),
        values: [],
        isFixed: false,
        isFlags: false,
        usage: UsageFlags.None, // We will add usage as we loop through the operations
        access: undefined, // Dummy value until we update models map
        crossLanguageDefinitionId: getCrossLanguageDefinitionId(type),
      };
      for (const member of knownValues.members.values()) {
        sdkType.values.push(getSdkEnumValue(context, sdkType, member));
      }
    }
    updateModelsMap(context, type, sdkType, operation);
    return sdkType;
  }
}

export function getClientTypeWithDiagnostics(
  context: TCGCContext,
  type: Type,
  operation?: Operation
): [SdkType, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  let retval: SdkType | undefined = undefined;
  switch (type.kind) {
    case "String":
    case "Number":
    case "Boolean":
      retval = getSdkConstant(context, type);
      break;
    case "Tuple":
      retval = diagnostics.pipe(getSdkTupleWithDiagnostics(context, type, operation));
      break;
    case "Model":
      retval = diagnostics.pipe(getSdkArrayOrDictWithDiagnostics(context, type, operation));
      if (retval === undefined) {
        retval = diagnostics.pipe(getSdkModelWithDiagnostics(context, type, operation));
      }
      break;
    case "Intrinsic":
      retval = getSdkBuiltInType(context, type);
      break;
    case "Scalar":
      if (!context.program.checker.isStdType(type) && type.kind === "Scalar" && type.baseScalar) {
        const baseType = diagnostics.pipe(
          getClientTypeWithDiagnostics(context, type.baseScalar, operation)
        );
        addEncodeInfo(context, type, baseType);
        addFormatInfo(context, type, baseType);
        retval = getKnownValuesEnum(context, type, operation) ?? baseType;
        break;
      }
      if (type.name === "utcDateTime" || type.name === "offsetDateTime") {
        retval = {
          ...getSdkTypeBaseHelper(context, type, type.name),
          encode: "rfc3339",
          wireType: { ...getSdkTypeBaseHelper(context, type, "string"), encode: "string" },
        } as SdkDatetimeType;
        break;
      }
      if (type.name === "duration") {
        retval = getSdkDurationType(context, type);
        break;
      }
      const scalarType = getSdkBuiltInType(context, type);
      // just add default encode, normally encode is on extended scalar and model property
      addEncodeInfo(context, type, scalarType);
      retval = scalarType;
      break;
    case "Enum":
      retval = getSdkEnum(context, type, operation);
      break;
    case "Union":
      retval = diagnostics.pipe(getSdkUnionWithDiagnostics(context, type, operation));
      break;
    case "ModelProperty":
      const innerType = diagnostics.pipe(
        getClientTypeWithDiagnostics(context, type.type, operation)
      );
      diagnostics.pipe(addEncodeInfo(context, type, innerType));
      addFormatInfo(context, type, innerType);
      retval = getKnownValuesEnum(context, type, operation) ?? innerType;
      break;
    case "UnionVariant":
      const unionType = diagnostics.pipe(
        getClientTypeWithDiagnostics(context, type.union, operation)
      );
      if (unionType.kind === "enum") {
        retval = unionType.values.find((x) => x.name === getLibraryName(context, type))!;
      } else {
        retval = diagnostics.pipe(getClientTypeWithDiagnostics(context, type.type, operation));
      }
      break;
    case "EnumMember":
      const enumType = getSdkEnum(context, type.enum, operation);
      retval = getSdkEnumValue(context, enumType, type);
      break;
    default:
      retval = getAnyType(context, type);
      diagnostics.add(
        createDiagnostic({ code: "unsupported-kind", target: type, format: { kind: type.kind } })
      );
  }
  return diagnostics.wrap(retval);
}

export function getClientType(context: TCGCContext, type: Type, operation?: Operation): SdkType {
  return ignoreDiagnostics(getClientTypeWithDiagnostics(context, type, operation));
}

export function isReadOnly(property: SdkBodyModelPropertyType) {
  if (
    property.visibility &&
    property.visibility.includes(Visibility.Read) &&
    property.visibility.length === 1
  ) {
    return true;
  }
  return false;
}

function getSdkVisibility(context: TCGCContext, type: ModelProperty): Visibility[] | undefined {
  const visibility = getVisibility(context.program, type);
  if (visibility) {
    const result = [];
    if (visibility?.includes("read")) {
      result.push(Visibility.Read);
    }
    if (visibility?.includes("create")) {
      result.push(Visibility.Create);
    }
    if (visibility?.includes("update")) {
      result.push(Visibility.Update);
    }
    if (visibility?.includes("delete")) {
      result.push(Visibility.Delete);
    }
    if (visibility?.includes("query")) {
      result.push(Visibility.Query);
    }
    return result;
  }
  return undefined;
}

function getAvailableApiVersions(context: TCGCContext, type: Type): string[] {
  const allVersions = getVersions(context.program, type)[1]?.getVersions() ?? [];
  const addedOnVersions = getAddedOnVersions(context.program, type)?.map((x) => x.value) ?? [];
  const removedOnVersions = getRemovedOnVersions(context.program, type)?.map((x) => x.value) ?? [];
  let added: boolean = addedOnVersions.length ? false : true;
  let addedCounter = 0;
  let removeCounter = 0;
  const retval: string[] = [];
  for (const version of allVersions) {
    if (addedCounter < addedOnVersions.length && version.value === addedOnVersions[addedCounter]) {
      added = true;
      addedCounter++;
    }
    if (
      removeCounter < removedOnVersions.length &&
      version.value === removedOnVersions[removeCounter]
    ) {
      added = false;
      removeCounter++;
    }
    if (added) retval.push(version.value);
  }
  return retval;
}

function getSdkModelPropertyType(
  context: TCGCContext,
  type: ModelProperty,
  operation?: Operation
): [SdkModelPropertyTypeBase, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  let propertyType = diagnostics.pipe(getClientTypeWithDiagnostics(context, type.type, operation));
  addEncodeInfo(context, type, propertyType);
  addFormatInfo(context, type, propertyType);
  const knownValues = getKnownValues(context.program, type);
  if (knownValues) {
    propertyType = getSdkEnum(context, knownValues, operation);
  }
  const docWrapper = getDocHelper(context, type);
  return diagnostics.wrap({
    __raw: type,
    description: docWrapper.description,
    details: docWrapper.details,
    apiVersions: getAvailableApiVersions(context, type),
    type: propertyType,
    nameInClient: getPropertyNames(context, type)[0],
    optional: type.optional,
  });
}

function getSdkBodyModelPropertyType(
  context: TCGCContext,
  type: ModelProperty,
  operation?: Operation
): [SdkBodyModelPropertyType, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  const base = diagnostics.pipe(getSdkModelPropertyType(context, type, operation));
  let operationIsMultipart = false;
  if (operation) {
    const httpOperation = diagnostics.pipe(getHttpOperation(context.program, operation));
    operationIsMultipart = Boolean(
      httpOperation && httpOperation.parameters.body?.contentTypes.includes("multipart/form-data")
    );
  }
  // Currently we only recognize bytes and list of bytes as potential file inputs
  const isBytesInput =
    base.type.kind === "bytes" ||
    (base.type.kind === "array" && base.type.valueType.kind === "bytes");
  if (isBytesInput && operationIsMultipart && getEncode(context.program, type)) {
    diagnostics.add(
      createDiagnostic({
        code: "encoding-multipart-bytes",
        target: type,
      })
    );
  }
  return diagnostics.wrap({
    ...base,
    kind: "property",
    optional: type.optional,
    visibility: getSdkVisibility(context, type),
    discriminator: false,
    serializedName: getPropertyNames(context, type)[1],
    isMultipartFileInput: isBytesInput && operationIsMultipart,
    flatten: shouldFlattenProperty(context, type),
  });
}

function addPropertiesToModelType(
  context: TCGCContext,
  type: Model,
  sdkType: SdkType,
  operation?: Operation
): [void, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  for (const property of type.properties.values()) {
    if (
      isStatusCode(context.program, property) ||
      isNeverType(property.type) ||
      isHeader(context.program, property) ||
      isQueryParam(context.program, property) ||
      isPathParam(context.program, property) ||
      sdkType.kind !== "model"
    ) {
      continue;
    }
    const clientProperty = diagnostics.pipe(
      getSdkBodyModelPropertyType(context, property, operation)
    );
    if (sdkType.properties) {
      sdkType.properties.push(clientProperty);
    } else {
      sdkType.properties = [clientProperty];
    }
  }
  return diagnostics.wrap(undefined);
}

function updateModelsMap(
  context: TCGCContext,
  type: Type,
  sdkType: SdkType,
  operation?: Operation
) {
  if (sdkType.kind !== "model" && sdkType.kind !== "enum") {
    return;
  }

  if (context.modelsMap === undefined) {
    context.modelsMap = new Map<Type, SdkModelType | SdkEnumType>();
  }
  if (context.operationModelsMap === undefined) {
    context.operationModelsMap = new Map<Operation, Map<Type, SdkModelType | SdkEnumType>>();
  }
  const value = context.modelsMap.get(type);
  if (value) {
    sdkType = value;
  } else {
    context.modelsMap.set(type, sdkType);
  }
  if (operation) {
    if (context.operationModelsMap.has(operation)) {
      if (context.operationModelsMap.get(operation)?.has(type)) {
        return;
      }
      context.operationModelsMap.get(operation)?.set(type, sdkType);
    } else {
      context.operationModelsMap.set(operation, new Map([[type, sdkType]]));
    }
    // TODO: it seems duplicate calculation, need to optimize later
    if (sdkType.kind === "model") {
      for (const prop of sdkType.properties) {
        if (prop.type.kind === "model" || prop.type.kind === "enum") {
          updateModelsMap(context, prop.type.__raw as any, prop.type, operation);
        }
        if (prop.type.kind === "array" || prop.type.kind === "dict") {
          updateModelsMap(
            context,
            prop.type.valueType.__raw as any,
            prop.type.valueType,
            operation
          );
        }
        if (prop.type.kind === "union") {
          for (const unionType of prop.type.values) {
            updateModelsMap(context, unionType.__raw as any, unionType, operation);
          }
        }
      }
      if (sdkType.baseModel) {
        updateModelsMap(context, sdkType.baseModel.__raw as any, sdkType.baseModel, operation);
      }
      if (sdkType.additionalProperties) {
        updateModelsMap(
          context,
          sdkType.additionalProperties.__raw as any,
          sdkType.additionalProperties,
          operation
        );
      }
      if (sdkType.discriminatedSubtypes) {
        for (const subtype of Object.values(sdkType.discriminatedSubtypes)) {
          updateModelsMap(context, subtype.__raw as any, subtype, operation);
        }
      }
    }
  }
}

function checkAndGetClientType(
  context: TCGCContext,
  type: Type,
  operation?: Operation
): [SdkType | undefined, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  if (type.kind === "Model") {
    if (isExclude(context, type)) return diagnostics.wrap(undefined); // eslint-disable-line deprecation/deprecation
    const effectivePayloadType = getEffectivePayloadType(context, type);
    if (context.filterOutCoreModels && isAzureCoreModel(effectivePayloadType))
      return diagnostics.wrap(undefined);
  }
  const clientType = diagnostics.pipe(getClientTypeWithDiagnostics(context, type, operation));
  return diagnostics.wrap(clientType);
}

function updateUsageOfModel(
  context: TCGCContext,
  type: SdkType,
  usage: UsageFlags,
  seenModelNames?: Set<SdkType>
): void {
  if (seenModelNames === undefined) {
    seenModelNames = new Set<SdkType>();
  }
  if (type.kind === "model" && seenModelNames.has(type)) return; // avoid circular references
  if (type.kind === "array" || type.kind === "dict") {
    return updateUsageOfModel(context, type.valueType, usage, seenModelNames);
  }
  if (type.kind === "union") {
    for (const unionType of type.values) {
      updateUsageOfModel(context, unionType, usage, seenModelNames);
    }
    return;
  }
  if (type.kind !== "model" && type.kind !== "enum") return;
  seenModelNames.add(type);

  const usageOverride = getUsageOverride(context, type.__raw as any);
  if (usageOverride) {
    type.usage |= usageOverride | usage;
  } else {
    type.usage |= usage;
  }

  if (type.kind === "enum") return;
  if (type.baseModel && (type.baseModel.usage & usage) === 0) {
    // if it has a base model and the base model doesn't currently have that usage
    type.baseModel.usage |= usage;
  }
  if (type.baseModel) {
    updateUsageOfModel(context, type.baseModel, usage, seenModelNames);
  }
  if (type.discriminatedSubtypes) {
    for (const discriminatedSubtype of Object.values(type.discriminatedSubtypes)) {
      updateUsageOfModel(context, discriminatedSubtype, usage, seenModelNames);
    }
  }
  if (type.additionalProperties) {
    updateUsageOfModel(context, type.additionalProperties, usage, seenModelNames);
  }
  for (const property of type.properties) {
    updateUsageOfModel(context, property.type, usage, seenModelNames);
  }
}

function updateTypesFromOperation(
  context: TCGCContext,
  operation: Operation
): [void, readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  const program = context.program;
  const httpOperation = diagnostics.pipe(getHttpOperation(program, operation));
  for (const param of httpOperation.parameters.parameters) {
    diagnostics.pipe(checkAndGetClientType(context, param.param.type, operation));
  }
  const generateConvenient = shouldGenerateConvenient(context, operation);
  if (httpOperation.parameters.body) {
    const body = diagnostics.pipe(
      checkAndGetClientType(context, httpOperation.parameters.body.type, operation)
    );
    if (
      body &&
      ["model", "enum", "array", "dict", "union"].includes(body.kind) &&
      generateConvenient
    ) {
      updateUsageOfModel(context, body, UsageFlags.Input);
    }
  }
  for (const response of httpOperation.responses) {
    for (const innerResponse of response.responses) {
      if (innerResponse.body?.type) {
        const responseBody = diagnostics.pipe(
          checkAndGetClientType(context, innerResponse.body.type, operation)
        );
        if (
          responseBody &&
          ["model", "enum", "array", "dict", "union"].includes(responseBody.kind) &&
          generateConvenient
        ) {
          updateUsageOfModel(context, responseBody, UsageFlags.Output);
        }
      }
    }
  }
  const lroMetaData = getLroMetadata(program, operation);
  if (lroMetaData && generateConvenient) {
    const logicalResult = diagnostics.pipe(
      checkAndGetClientType(context, lroMetaData.logicalResult, operation)
    );
    if (logicalResult) {
      updateUsageOfModel(context, logicalResult, UsageFlags.Output);
    }
    const envelopeResult = diagnostics.pipe(
      checkAndGetClientType(context, lroMetaData.envelopeResult, operation)
    );
    // TODO: currently skipping adding of envelopeResult due to arm error
    // https://github.com/Azure/typespec-azure/issues/311
    if (envelopeResult && !context.arm) {
      updateUsageOfModel(context, envelopeResult, UsageFlags.Output);
    }
  }
  return diagnostics.wrap(undefined);
}

function updateAccessOfModel(context: TCGCContext): void {
  for (const [type, sdkType] of context.modelsMap?.entries() ?? []) {
    const internal = isInternal(context, type as any); // eslint-disable-line deprecation/deprecation
    if (internal) {
      sdkType.access = "internal";
      continue;
    }

    const accessOverride = getAccessOverride(context, type as any);
    if (accessOverride) {
      sdkType.access = accessOverride;
      continue;
    }

    let referredByInternal = false;
    let referredByPublic = false;
    let referredByUndefined = false;
    for (const [operation, modelMap] of context.operationModelsMap!) {
      const access = getAccessOverride(context, operation);
      if (access === "internal" && modelMap.get(type)) {
        referredByInternal = true;
      } else if (access === "public" && modelMap.get(type)) {
        referredByPublic = true;
        break;
      } else if (access === undefined && modelMap.get(type)) {
        referredByUndefined = true;
      }
    }
    if (referredByPublic) {
      sdkType.access = "public";
    } else if (referredByInternal && !referredByUndefined) {
      sdkType.access = "internal";
    }
  }
}

interface GetAllModelsOptions {
  input?: boolean;
  output?: boolean;
}

function handleServiceOrphanType(context: TCGCContext, type: Model | Enum) {
  const diagnostics = createDiagnosticCollector();
  // eslint-disable-next-line deprecation/deprecation
  if (type.kind === "Model" && isInclude(context, type)) {
    const sdkModel = diagnostics.pipe(checkAndGetClientType(context, type));
    if (sdkModel && ["model", "enum", "array", "dict", "union"].includes(sdkModel.kind)) {
      updateUsageOfModel(context, sdkModel, UsageFlags.Input | UsageFlags.Output);
    }
  }
  if (getAccessOverride(context, type) !== undefined) {
    const sdkModel = diagnostics.pipe(checkAndGetClientType(context, type));
    if (sdkModel && ["model", "enum", "array", "dict", "union"].includes(sdkModel.kind)) {
      updateUsageOfModel(context, sdkModel, UsageFlags.None);
    }
  }
}

export function getAllModelsWithDiagnostics(
  context: TCGCContext,
  options: GetAllModelsOptions = {}
): [(SdkModelType | SdkEnumType)[], readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  const defaultOptions = {
    input: true,
    output: true,
  };
  options = { ...defaultOptions, ...options };
  if (context.modelsMap === undefined) {
    context.modelsMap = new Map<Type, SdkModelType | SdkEnumType>();
  }
  if (context.operationModelsMap === undefined) {
    context.operationModelsMap = new Map<Operation, Map<Type, SdkModelType | SdkEnumType>>();
  }
  for (const client of listClients(context)) {
    for (const operation of listOperationsInOperationGroup(context, client)) {
      // operations on a client
      diagnostics.pipe(updateTypesFromOperation(context, operation));
    }
    const ogs = listOperationGroups(context, client);
    while (ogs.length) {
      const operationGroup = ogs.pop();
      for (const operation of listOperationsInOperationGroup(context, operationGroup!)) {
        // operations on operation groups
        diagnostics.pipe(updateTypesFromOperation(context, operation));
      }
      if (operationGroup?.subOperationGroups) {
        ogs.push(...operationGroup.subOperationGroups);
      }
    }
    // orphan models
    for (const model of client.service.models.values()) {
      handleServiceOrphanType(context, model);
    }
    // orphan enums
    for (const enumType of client.service.enums.values()) {
      handleServiceOrphanType(context, enumType);
    }
    // server parameters
    const servers = getServers(context.program, client.service);
    if (servers !== undefined && servers[0].parameters !== undefined) {
      for (const param of servers[0].parameters.values()) {
        const sdkModel = diagnostics.pipe(checkAndGetClientType(context, param));
        if (sdkModel && ["model", "enum", "array", "dict", "union"].includes(sdkModel.kind)) {
          updateUsageOfModel(context, sdkModel, UsageFlags.Input);
        }
      }
    }
  }
  // update access
  updateAccessOfModel(context);
  let filter = 0;
  if (options.input) {
    filter += UsageFlags.Input;
  }
  if (options.output) {
    filter += UsageFlags.Output;
  }

  return diagnostics.wrap([...context.modelsMap.values()].filter((t) => (t.usage & filter) > 0));
}

export function getAllModels(
  context: TCGCContext,
  options: GetAllModelsOptions = {}
): (SdkModelType | SdkEnumType)[] {
  // we currently don't return diagnostics even though we keep track of them
  // when we move to the new sdk type ecosystem completely, we'll expose
  // diagnostics as a separate property on the TCGCContext
  return ignoreDiagnostics(getAllModelsWithDiagnostics(context, options));
}
