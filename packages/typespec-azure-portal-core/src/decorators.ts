import { ArmResourceKind, getArmResourceKind } from "@azure-tools/typespec-azure-resource-manager";
import {
  CompilerHost,
  DecoratorContext,
  Model,
  ModelProperty,
  Program,
  StringLiteral,
  Type,
  getDirectoryPath,
  getSourceLocation,
  normalizePath,
  resolvePath,
  validateDecoratorUniqueOnNode,
} from "@typespec/compiler";
import * as fs from "fs";
import { PortalCoreKeys } from "./keys.js";
import { reportDiagnostic } from "./lib.js";
import { AboutOptions, BrowseOptions, marketplaceOfferOptions } from "./types.js";

/**
 * This is a Browse decorator which will be use to put more info on the browse view.
 * @param target The model that is being decorated.
 * @param options BrowseOptions of the property.
 */
export async function $browse(context: DecoratorContext, target: Model, options: BrowseOptions) {
  const { program } = context;
  validateDecoratorUniqueOnNode(context, target, $browse);
  isARMResource(program, target, "browse");
  const browseOptionsResult: BrowseOptions = {};
  if (options && (options as Model).properties) {
    const query = (options as Model).properties.get("argQuery");
    if (query && query.type.kind === "Model") {
      //use decoratorTarget to find sourceLocation instead of target, since we want to find a file path related to where decorator was stated
      const decoratorTarget = context.decoratorTarget;
      const sourceLocation = getSourceLocation(decoratorTarget);
      const dirPath =
        sourceLocation && sourceLocation.file.path && getDirectoryPath(sourceLocation.file.path);
      let argQueryPath = query.type && (query.type as Model).properties.get("filePath");
      const argQueryPathValue =
        argQueryPath && argQueryPath.type && (argQueryPath.type as StringLiteral).value;
      let filePath = resolvePath(dirPath, argQueryPathValue); //if given path is fullpath, it will return the fullPath
      if (filePath && argQueryPath && argQueryPathValue) {
        filePath = normalizePath(filePath);
        // const result = (await context.program.host.stat(filePath)).isFile();
        //   if (!result) {
        //     reportDiagnostic(program, {
        //       code: "file-not-found",
        //       format: {
        //         decoratorName: "browse",
        //         propertyName: "argQuery",
        //         filePath: filePath
        //       },
        //       target,
        //     });
        //   }
        // await context.program.host.stat(filePath).then(result => {
        //   if (!result.isFile() || result.isDirectory()) {
        //     reportDiagnostic(program, {
        //       code: "file-not-found",
        //       format: {
        //         decoratorName: "browse",
        //         propertyName: "argQuery",
        //         filePath: filePath
        //       },
        //       // messageId: "browseargQuery",
        //       target,
        //     });
        //   };
        // });
        // if ((await isFileExist(context.program.host, filePath))) {
        // //if (!result.isFile() || result.isDirectory()) {
        //   reportDiagnostic(program, {
        //     code: "fileNotFound",
        //     messageId: "browseargQuery",
        //     target,
        //   });
        // }

        if (!fs.existsSync(filePath)) {
          reportDiagnostic(program, {
            code: "file-not-found",
            format: {
              decoratorName: "browse",
              propertyName: "argQuery",
              filePath: filePath,
            },
            //messageId: "browseargQuery",
            target,
          });
        }

        //(argQueryPath.type as StringLiteral).value = filePath;
        // const bOptions: BrowseOptions = {
        //   argQuery: {
        //     filePath : filePath
        //   }
        // }
        browseOptionsResult.argQuery = {
          filePath: filePath,
        };
        program.stateMap(PortalCoreKeys.browse).set(target, browseOptionsResult);
      }
    } else if (query?.type.kind == "String") {
      // const bOptions: BrowseOptions = {
      //   argQuery: (query.type as StringLiteral).value
      // }
      browseOptionsResult.argQuery = (query.type as StringLiteral).value;
      program.stateMap(PortalCoreKeys.browse).set(target, browseOptionsResult);
    }
  }
}

export async function isFileExist(host: CompilerHost, filePath: string) {
  try {
    const stats = await host.stat(filePath);
    return stats.isFile();
  } catch (e: any) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return false;
    }
    throw e;
  }
}

export function getBrowse(program: Program, target: Type) {
  return program.stateMap(PortalCoreKeys.browse).get(target);
}

export function getBrowseArgQuery(program: Program, target: Type) {
  return getBrowse(program, target)?.argQuery;
}

export function isARMResource(
  program: Program,
  target: Model,
  decoratorName: "browse" | "about" | "marketplaceOffer"
) {
  if (
    getArmResourceKind(target) !== ("Tracked" as ArmResourceKind) &&
    getArmResourceKind(target) !== ("Proxy" as ArmResourceKind)
  ) {
    reportDiagnostic(program, {
      code: "not-a-resource",
      format: {
        decoratorName: decoratorName,
      },
      target,
    });
  }
}

/**
 * This is a About decorator that will be used to define icon, keywords and learnMoreDocs.
 * @param target The model that is being decorated.
 * @param options AboutOptions of the property.
 */
export async function $about(context: DecoratorContext, target: Model, options: AboutOptions) {
  const { program } = context;
  validateDecoratorUniqueOnNode(context, target, $about);
  isARMResource(program, target, "about");
  const aboutOptionsResult: AboutOptions = {};

  if (options && (options as Model).properties) {
    const icon = (options as Model).properties.get("icon");
    const learnMoreDocs = (options as Model).properties.get("learnMoreDocs");
    const keywords = (options as Model).properties.get("keywords");
    const displayName = (options as Model).properties.get("displayName");
    if (icon) {
      if (icon.type.kind === "Model") {
        //use decoratorTarget to find sourceLocation instead of target, since we want to find a file path related to where decorator was stated
        const decoratorTarget = context.decoratorTarget;
        const sourceLocation = getSourceLocation(decoratorTarget);
        const dirPath =
          sourceLocation && sourceLocation.file.path && getDirectoryPath(sourceLocation.file.path);
        let iconPath = icon.type && (icon.type as Model).properties.get("filePath");
        const iconPathValue = iconPath && iconPath.type && (iconPath.type as StringLiteral).value;
        let filePath = resolvePath(dirPath, iconPathValue); //if given path is fullpath, it will return the fullPath
        if (filePath && iconPath && iconPathValue) {
          filePath = normalizePath(filePath);
          // const result = (await context.program.host.stat(filePath)).isFile();
          // if (!result) {
          //   reportDiagnostic(program, {
          //     code: "file-not-found",
          //     format: {
          //       decoratorName: "about",
          //       propertyName: "icon",
          //       filePath: filePath
          //     },
          //     target,
          //   });
          // }
          // await context.program.host.stat(filePath).then(result => {
          //   if (!result.isFile() || result.isDirectory()) {
          //     reportDiagnostic(program, {
          //       code: "file-not-found",
          //       format: {
          //         decoratorName: "about",
          //         propertyName: "icon",
          //         filePath: filePath
          //       },
          //       target,
          //     });
          //   };
          // });
          if (!fs.existsSync(filePath)) {
            reportDiagnostic(program, {
              code: "file-not-found",
              format: {
                decoratorName: "about",
                propertyName: "icon",
                filePath: filePath,
              },
              target,
            });
          }
          //(iconPath.type as StringLiteral).value = filePath;
          aboutOptionsResult.icon = {
            filePath: filePath,
          };
        }
      }
    }
    if (learnMoreDocs) {
      if (learnMoreDocs.type.kind === "Tuple") {
        const learnMoreDocsValues = learnMoreDocs.type.values
          .filter((value) => value.kind === "String")
          .map((value: Type) => (value as StringLiteral).value);
        aboutOptionsResult.learnMoreDocs = learnMoreDocsValues;
      }
    }
    if (keywords) {
      if (keywords.type.kind === "Tuple") {
        aboutOptionsResult.keywords = keywords.type.values
          .filter((value) => value.kind === "String")
          .map((value: Type) => (value as StringLiteral).value);
      }
    }
    if (displayName) {
      if (displayName.type.kind === "String") {
        aboutOptionsResult.displayName = (displayName.type as StringLiteral).value;
      }
    }
  }
  program.stateMap(PortalCoreKeys.about).set(target, aboutOptionsResult);
}

export function getAbout(program: Program, target: Type) {
  return program.stateMap(PortalCoreKeys.about).get(target);
}

export function getAboutDisplayName(program: Program, target: Type) {
  return getAbout(program, target).displayName;
}

export function getAboutKeywords(program: Program, target: Type) {
  return getAbout(program, target).keywords;
}

export function getAboutLearnMoreDocs(program: Program, target: Type) {
  return getAbout(program, target).learnMoreDocs;
}

export function $marketplaceOffer(
  context: DecoratorContext,
  target: Model,
  options: marketplaceOfferOptions
) {
  const { program } = context;
  validateDecoratorUniqueOnNode(context, target, $marketplaceOffer);
  isARMResource(program, target, "marketplaceOffer");
  const marketPlaceOfferResult: marketplaceOfferOptions = {};
  if (options && (options as Model).properties) {
    const id = (options as Model).properties.get("id");
    if (id?.type.kind === "String") {
      if (id.type.value.match(/\s/)) {
        reportDiagnostic(program, {
          code: "invalid-offer-id",
          messageId: "marketplaceOfferId",
          target,
        });
      }
      marketPlaceOfferResult.id = (id.type as StringLiteral).value;
    }
    program.stateMap(PortalCoreKeys.marketplaceOffer).set(target, marketPlaceOfferResult);
  }
}

export function getMarketplaceOfferId(program: Program, target: Type) {
  return program.stateMap(PortalCoreKeys.marketplaceOffer).get(target).id;
}

// export function $patternValidationMessage(context:DecoratorContext, target: Scalar | ModelProperty, message: string) {
//   const { program } = context;
//   validateDecoratorUniqueOnNode(context, target, $patternValidationMessage);
//   validateDecoratorNotOnType(context, target, $pattern, $patternValidationMessage);
//   const patternSymbol = Symbol.for("TypeSpec.pattern");
//   const pattern = program.stateMap(patternSymbol).get(target);
//   const pat = getPattern(program, target);
//   program.stateMap(PortalCoreKeys.patternValidationMessage).set(target, message);
// }

// export function getPatternValidationMessage(program: Program, target: Type): string | undefined {
//   const result = program.stateMap(PortalCoreKeys.patternValidationMessage).get(target);
//   return result && result.value;
// }

export function $displayName(context: DecoratorContext, target: ModelProperty, name: string) {
  const { program } = context;
  validateDecoratorUniqueOnNode(context, target, $displayName);
  program.stateMap(PortalCoreKeys.displayName).set(target, name);
}

export function getDisplayName(program: Program, target: Type): string | undefined {
  return program.stateMap(PortalCoreKeys.displayName).get(target);
}

// const essentialsMap = new WeakMap<Program, string[]>();
// export function $essentials(context: DecoratorContext, target: ModelProperty) {

//   validateDecoratorUniqueOnNode(context, target, $essentials);
//   const { program } = context;

//   if (!essentialsMap.has(context.program)) {
//     essentialsMap.set(context.program, []);
//   }
//   const essentialsArray = essentialsMap.get(context.program) ?? [];

//   if(essentialsArray.length >= 5) {
//     reportDiagnostic(program, {
//       code: "essentials-maximum-usage",
//       messageId: "default",
//       target
//     })
//   }
//   if(!essentialsArray.includes(target.name) && !Object.keys(target).includes("sourceProperty")) {
//     essentialsArray.push(target.name);
//     program.stateSet(PortalCoreKeys.essentials).add({kind: "String", value: target.name} as StringLiteral);
//   }

// }

// export function isEssential(program: Program, target: ModelProperty) {
//   return program.stateSet(PortalCoreKeys.essentials).has(target);
// }

// function validateTargetingAString(
//   context: DecoratorContext,
//   target: Scalar | ModelProperty,
//   decoratorName: string
// ) {
//   const valid = isTypeIn(getPropertyType(target), (x) => isStringType(context.program, x));
//   if (!valid) {
//     reportDiagnostic(context.program, {
//       code: "decorator-wrong-target",
//       format: {
//         decorator: decoratorName,
//         to: `type it is not a string`,
//       },
//       target: context.decoratorTarget,
//     });
//   }
//   return valid;
// }
