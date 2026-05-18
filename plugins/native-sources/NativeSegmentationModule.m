#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

@interface NativeSegmentationModule (RCTExternModule) <RCTBridgeModule>
@end

@implementation NativeSegmentationModule (RCTExternModule)
RCT_EXPORT_MODULE()
RCT_EXTERN_METHOD(applyFoodOutline:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cropFood:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(blurBackground:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getContourPaths:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
@end
