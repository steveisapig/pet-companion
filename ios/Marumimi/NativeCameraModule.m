#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

@interface NativeCameraModuleExport : NSObject <RCTBridgeModule>
@end

@implementation NativeCameraModuleExport {
  NativeCameraModule *_impl;
}

RCT_EXPORT_MODULE(NativeCameraModule)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if (self = [super init]) {
    _impl = [NativeCameraModule new];
  }
  return self;
}

RCT_EXPORT_METHOD(launchCamera:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl launchCamera:resolve withRejecter:reject];
}

@end
