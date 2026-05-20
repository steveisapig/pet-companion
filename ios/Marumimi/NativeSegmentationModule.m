#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

@interface NativeSegmentationModuleExport : NSObject <RCTBridgeModule>
@end

@implementation NativeSegmentationModuleExport {
  NativeSegmentationModule *_impl;
}

RCT_EXPORT_MODULE(NativeSegmentationModule)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if (self = [super init]) {
    _impl = [NativeSegmentationModule new];
  }
  return self;
}

RCT_EXPORT_METHOD(applyFoodOutline:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl applyFoodOutline:imageUri withResolver:resolve withRejecter:reject];
}

RCT_EXPORT_METHOD(cropFood:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl cropFood:imageUri withResolver:resolve withRejecter:reject];
}

RCT_EXPORT_METHOD(blurBackground:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl blurBackground:imageUri withResolver:resolve withRejecter:reject];
}

RCT_EXPORT_METHOD(getContourPaths:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl getContourPaths:imageUri withResolver:resolve withRejecter:reject];
}

@end
