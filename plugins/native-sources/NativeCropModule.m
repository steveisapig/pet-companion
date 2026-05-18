#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

@interface NativeCropModule (RCTExternModule) <RCTBridgeModule>
@end

@implementation NativeCropModule (RCTExternModule)
RCT_EXPORT_MODULE()
RCT_EXTERN_METHOD(cropImage:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
@end
