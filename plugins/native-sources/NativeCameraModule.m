#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

@interface NativeCameraModule (RCTExternModule) <RCTBridgeModule>
@end

@implementation NativeCameraModule (RCTExternModule)
RCT_EXPORT_MODULE()
RCT_EXTERN_METHOD(launchCamera:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
@end
