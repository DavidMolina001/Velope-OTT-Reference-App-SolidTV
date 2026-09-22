# Generates RemoteDriver.xcodeproj (a tvOS UI-testing bundle with no host app) with the
# xcodeproj gem, so the driver needs no hand-written pbxproj. Run once: ruby generate.rb
require 'xcodeproj'
path = File.join(__dir__, 'RemoteDriver.xcodeproj')
project = Xcodeproj::Project.new(path)
target = project.new_target(:ui_test_bundle, 'RemoteDriverUITests', :tvos, '16.0')
group = project.main_group.new_group('RemoteDriverUITests', 'RemoteDriverUITests')
target.add_file_references([group.new_file('RemoteDriverUITests.swift')])
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.edinburghanalytics.remotedriver'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['CODE_SIGN_IDENTITY'] = ''
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '3'
  config.build_settings['SDKROOT'] = 'appletvos'
  config.build_settings['TVOS_DEPLOYMENT_TARGET'] = '16.0'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['MARKETING_VERSION'] = '1.0'
end
scheme = Xcodeproj::XCScheme.new
scheme.add_test_target(target)
scheme.save_as(path, 'RemoteDriverUITests', true)
project.save
puts "generated #{path}"
