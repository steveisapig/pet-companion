#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

@interface NativeCropModuleExport : NSObject <RCTBridgeModule>
@end

@implementation NativeCropModuleExport {
  NativeCropModule *_impl;
}

RCT_EXPORT_MODULE(NativeCropModule)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if (self = [super init]) {
    _impl = [NativeCropModule new];
  }
  return self;
}

RCT_EXPORT_METHOD(cropImage:(NSString *)imageUri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl cropImage:imageUri withResolver:resolve withRejecter:reject];
}

@end
