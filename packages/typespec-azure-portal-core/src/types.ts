import { EnumMember } from "@typespec/compiler";

export interface FilePath {
  filePath: string;
}

export interface AboutOptions {
  icon?: FilePath;
  displayName?: string;
  description?: string;
  keywords?: string[];
  learnMoreDocs?: learnMoreDocsOptions[];
}

export interface BrowseOptions {
  argQuery?: string | FilePath;
}

export interface marketplaceOfferOptions {
  id?: string;
}

export interface PromotionOptions {
  readonly apiVersion: string | EnumMember;
  readonly autoUpdate?: boolean;
}

export interface learnMoreDocsOptions {
  title: string;
  uri: string;
}
