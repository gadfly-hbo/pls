import {
  buildSingleProductPortraitModelMetadata,
  predictSingleProductPortraitFromCleanInput,
  SingleProductPortraitModelUnavailableError,
  resolveSingleProductPortraitModelPath,
  type CleanSingleProductPortraitInput,
  type SingleProductPortraitModelMetadata,
  type SingleProductPortraitServiceOptions,
} from "../../../../model/src/single-product-portrait-supervised.js";
import { type SingleProductPortraitPrediction } from "../../../../model/src/single-product-portrait.js";

export type {
  CleanSingleProductPortraitInput,
  SingleProductPortraitModelMetadata,
  SingleProductPortraitPrediction,
};

export { SingleProductPortraitModelUnavailableError };

export function getSingleProductPortraitMetadata(): SingleProductPortraitModelMetadata {
  return buildSingleProductPortraitModelMetadata();
}

export function predictSingleProductPortrait(
  input: CleanSingleProductPortraitInput,
  options?: SingleProductPortraitServiceOptions,
): SingleProductPortraitPrediction {
  return predictSingleProductPortraitFromCleanInput(input, options);
}

export function resolveModelPath(): string {
  return resolveSingleProductPortraitModelPath();
}
