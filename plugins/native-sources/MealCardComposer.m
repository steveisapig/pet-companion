#import <React/RCTBridgeModule.h>
#import "Marumimi-Swift.h"

// Pure Obj-C class — +load in @implementation (not a category) is guaranteed to run.
// Delegates actual image generation to the Swift MealCardComposer class.
@interface MealCardComposerModule : NSObject <RCTBridgeModule>
@end

@implementation MealCardComposerModule {
  MealCardComposer *_impl;
}

RCT_EXPORT_MODULE(MealCardComposer)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if (self = [super init]) {
    _impl = [MealCardComposer new];
  }
  return self;
}

RCT_EXPORT_METHOD(compose:(NSDictionary *)options
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject) {
  [_impl compose:options withResolver:resolve withRejecter:reject];
}

@end
