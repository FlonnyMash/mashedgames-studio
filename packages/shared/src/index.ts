export {
  AssetReadyPayloadSchema,
  LoadExternalAssetPayloadSchema,
  SetRuntimeAssetsPayloadSchema,
  type AssetReadyPayload,
  type LoadExternalAssetPayload,
  type SetRuntimeAssetsPayload,
} from "./asset-bridge";

export {
  STUDIO_PROTOCOL,
  NullableAssetStringSchema,
  ProjectRelativePathSchema,
  StudioAssetUrlSchema,
  coerceAssetReference,
  isDataUrlAsset,
  isProjectRelativeAssetPath,
  isStudioAssetUrl,
  isValidPersistedAssetString,
  parseAssetReference,
  resolveStudioAssetUrl,
  type AssetReference,
} from "./asset-reference";

export {
  resolveAssetPreviewUrl,
  type AssetPreviewContext,
} from "./resolve-asset-preview-url";

export {
  UNIVERSAL_TEXTURE_FIELD_MAP,
  getDynamicTextureFieldMap,
  isUniversalTextureField,
  listConfiguredAssetUploads,
  textureKeyForConfigField,
  type ConfiguredAssetUpload,
  type UniversalTextureFieldKey,
} from "./config-asset-fields";

export {
  AppModeSchema,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GAME_TEMPLATE_ID,
  DEFAULT_SCHEMA_VERSION,
  GameConfigSchema,
  exportClientPayload,
  getPrimaryBrandColor,
  normalizeGameConfig,
  parseGameConfig,
  patchConfig,
  patchFlatConfig,
  patchTemplateField,
  type AppMode,
  type GameConfig,
  type GameTemplateId,
} from "./flat-game-config";

export {
  TEMPLATE_FIELD_TYPE,
  TemplateFieldDescriptorSchema,
  TemplateFieldTypeSchema,
  buildDefaultFieldValues,
  buildFieldsZodSchema,
  imageFieldDescriptors,
  type TemplateFieldDescriptor,
  type TemplateFieldType,
} from "./template-field-schema";

export {
  BASELINE_TEMPLATE_ID,
  LEGACY_DEFAULT_TEMPLATE_ID,
  isLegacyTemplateId,
  normalizeTemplateId,
} from "./template-id";

export { applyTemplateConfigDefaults } from "./template-config-defaults";

export {
  FLAT_FIELD_REGISTRY,
  GROUP_REGISTRY,
  fieldsForGroup,
  fieldsForMode,
  groupsForMode,
  ungroupedFields,
  type FlatFieldDefinition,
  type FlatFieldSurface,
  type FlatFieldType,
  type GroupDefinition,
  type StyleBindings,
} from "./flat-field-registry";

export {
  BRIDGE_MESSAGE_TYPE,
  AssetLoadErrorMessageSchema,
  AssetReadyMessageSchema,
  BridgeMessageSchema,
  ConfigSyncPayloadSchema,
  ConfigUpdatedMessageSchema,
  EngineReadyMessageSchema,
  GameEventMessageSchema,
  GameLifecycleEventMessageSchema,
  HostReadyMessageSchema,
  LoadExternalAssetMessageSchema,
  LoadTemplateMessageSchema,
  SetRuntimeAssetsMessageSchema,
  UpdateConfigMessageSchema,
  isAssetLoadErrorMessage,
  isConfigUpdatedMessage,
  isEngineControlMessage,
  isEngineReadyMessage,
  isGameEventMessage,
  isGameLifecycleEventMessage,
  isHostReadyMessage,
  isLoadTemplateMessage,
  isUpdateConfigMessage,
  parseBridgeMessage,
  type AssetLoadErrorMessage,
  type AssetLoadErrorPayload,
  type AssetReadyMessage,
  type BridgeMessage,
  type BridgeMessageType,
  type ConfigSyncPayload,
  type ConfigUpdatedMessage,
  type EngineControlAction,
  type EngineControlMessage,
  type HostReadyMessage,
  type EngineReadyMessage,
  type GameEventMessage,
  type GameLifecycleEventMessage,
  type LoadExternalAssetMessage,
  type LoadTemplateMessage,
  type SetRuntimeAssetsMessage,
  type UpdateConfigMessage,
  EngineControlActionSchema,
  EngineControlMessageSchema,
} from "./bridge-contract";

export {
  GameClaimSchema,
  parseGameClaim,
  type GameClaim,
} from "./game-claim";

export {
  PRIZE_TIER_VALUES,
  PRIZE_TIER_LABELS,
  PrizeTierEnum,
  normalizePrizeToTier,
  parsePrizeTier,
  type PrizeTier,
} from "./prize-tier";

export {
  COUPON_UPLOAD_MAX_CODES,
  COUPON_MAX_USES_LIMIT,
  CouponUploadInputSchema,
  CouponUpdateInputSchema,
  emptyCouponTierCounts,
  parseCouponUploadInput,
  type CouponUploadInput,
  type CouponUpdateInput,
  type CouponTierCounts,
  type CouponListItem,
} from "./coupon-contract";

export {
  LEAD_WEBHOOK_EVENT,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  LeadSubmitPayloadSchema,
  LeadWebhookDataSchema,
  LeadWebhookEventSchema,
  buildLeadWebhookEvent,
  parseLeadSubmitPayload,
  type LeadSubmitPayload,
  type LeadWebhookData,
  type LeadWebhookEvent,
} from "./webhook-contract";

export {
  buildSignedWebhookHeaders,
  signWebhookPayload,
} from "./webhook-sign";

export {
  PROJECT_ID_PATTERN,
  ClientProjectPayloadSchema,
  GameProjectManifestSchema,
  ParentDriftItemSchema,
  ParentDriftReportSchema,
  ParentLockSnapshotSchema,
  SaveModeSchema,
  type ClientProjectPayload,
  type GameProjectManifest,
  type ParentDriftItem,
  type ParentDriftReport,
  type ParentLockSnapshot,
  type SaveMode,
} from "./game-project";

export {
  UnauthorizedProjectAccessError,
  assertProjectOwnership,
  buildProjectSignaturePayload,
  isLegacyProjectManifest,
  signProjectPayload,
  verifyProjectSignature,
} from "./project-ownership";

export {
  assertPermission,
  canAccess,
  filterFieldsByMode,
  getFieldsForMode,
  surfaceForMode,
  PermissionDeniedError,
  type RegistryResource,
} from "./permissions";

export {
  buildInitialClientPayload,
  buildProjectConfigFromClient,
  defaultProjectManifestFields,
  enrichClientMeta,
  slugifyProjectId,
} from "./project-utils";

export {
  SupabaseAuthPrivateKeyP256Schema,
  SupabaseAuthPublicKeyP256Schema,
  SupabasePublishableKeySchema,
  SupabaseSecretKeySchema,
  usesLegacySupabaseApiKeys,
  SupabasePublicEnvSchema,
  SupabaseRuntimeEnvSchema,
  SupabaseServerEnvSchema,
  parseSupabasePublicEnv,
  parseSupabaseRuntimeEnv,
  parseSupabaseServerEnv,
  CloudflareDeployEnvSchema,
  parseCloudflareDeployEnv,
  loadCloudflareDeployEnv,
  type SupabasePublicEnv,
  type SupabaseRuntimeEnv,
  type SupabaseServerEnv,
  type CloudflareDeployEnv,
} from "./env-schema";

export {
  APP_DISPLAY_NAME,
  BRAND_LOGO_FILENAME,
  BRAND_LOGO_URL_PATH,
  DEFAULT_PLATFORM_CONFIG,
  PlatformConfigSchema,
  PlatformFeaturesSchema,
  parsePlatformConfig,
  type PlatformConfig,
  type PlatformFeatures,
} from "./platform-schema";

export {
  DESKTOP_BUNDLED_TEMPLATE_ID,
  getDesktopBundledTemplateIds,
  resolveControlAssetPreviewSrc,
  resolveGameEngineBaseUrl,
  resolveTemplatePreviewUrl,
} from "./template-preview-url";

export {
  LIBRARY_DIR_NAME,
  PROJECTS_DIR_NAME,
  ensureWorkspaceExists,
  getLibraryRoot,
  getProjectsRoot,
  getWorkspacePathFromEnv,
  type EnsureWorkspaceOptions,
} from "./workspace";

export {
  GAME_LIFECYCLE_EVENT_TYPE,
  GameLifecycleEventPayloadSchema,
  GameLifecycleEventTypeSchema,
  parseGameLifecycleEventPayload,
  type GameLifecycleEventPayload,
  type GameLifecycleEventType,
  type GameOverlaySubscriber,
} from "./game-events";

export {
  UI_MODULE,
  UIModuleSchema,
  AssetFormatSchema,
  AssetDimensionsSchema,
  AssetRestrictionSchema,
  TemplateSchemaSchema,
  isLockedField,
  supportsUIModule,
  parseTemplateSchema,
  type AssetFormat,
  type AssetRestriction,
  type TemplateSchema,
  type UIModule,
} from "./template-schema";

export {
  TAG_SLUG_REGEX,
  TagSlugSchema,
  TagCategorySchema,
  CreateTagCategoryInputSchema,
  UpdateTagCategoryInputSchema,
  TagSchema,
  CreateTagInputSchema,
  UpdateTagInputSchema,
  TemplateTagSchema,
  SyncTemplateTagsInputSchema,
  PublishedTagRefSchema,
  PublishedTagUsageSchema,
  StorefrontTagFilterTagSchema,
  StorefrontTagFilterCategorySchema,
  PublishedTemplateWithTagsSchema,
  TagCategoryRowSchema,
  TagRowSchema,
  TemplateTagRowSchema,
  PublishedTagUsageRowSchema,
  PublishedCatalogRowSchema,
  slugifyTagName,
  resolveTagSlug,
  tagCategoryFromRow,
  tagFromRow,
  templateTagFromRow,
  publishedTagUsageFromRow,
  publishedTemplateWithTagsFromRow,
  parseTagCategory,
  parseTag,
  parseTemplateTag,
  parseTagCategoryRow,
  parseTagRow,
  parseTemplateTagRow,
  parsePublishedTagUsageRow,
  parseStorefrontTagFilters,
  parseStorefrontTagFiltersFromRpc,
  type TagCategory,
  type CreateTagCategoryInput,
  type UpdateTagCategoryInput,
  type Tag,
  type CreateTagInput,
  type UpdateTagInput,
  type TemplateTag,
  type SyncTemplateTagsInput,
  type PublishedTagRef,
  type PublishedTagUsage,
  type StorefrontTagFilterTag,
  type StorefrontTagFilterCategory,
  type PublishedTemplateWithTags,
  type TagCategoryRow,
  type TagRow,
  type TemplateTagRow,
  type PublishedTagUsageRow,
  type PublishedCatalogRowInput,
} from "./tag-schema";

export {
  BADGE_CONFIG,
  BADGE_TYPES,
  BadgeTypeSchema,
  TEMPLATE_CONTROL_PRESETS,
  TemplateControlEntrySchema,
  TemplateControlsSchema,
  TemplateMetadataSchema,
  TemplateMetadataRowSchema,
  UpdateTemplateMetadataInputSchema,
  getBadgeStyle,
  isBadgeType,
  parseTemplateMetadataRow,
  parseTemplateControls,
  parseUpdateTemplateMetadataInput,
  templateMetadataFromRow,
  type BadgeStyle,
  type BadgeType,
  type TemplateControlEntry,
  type TemplateControls,
  type TemplateMetadata,
  type TemplateMetadataRow,
  type UpdateTemplateMetadataInput,
} from "./template-metadata-schema";
