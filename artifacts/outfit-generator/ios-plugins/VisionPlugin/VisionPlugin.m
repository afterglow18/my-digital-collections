#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Register VisionPlugin with the Capacitor plugin system.
// This ObjC bridge file must be compiled into the App target alongside VisionPlugin.swift.
CAP_PLUGIN(VisionPlugin, "VisionPlugin",
    CAP_PLUGIN_METHOD(analyzeImage, CAPPluginReturnPromise);
)
