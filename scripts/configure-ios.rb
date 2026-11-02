require 'fileutils'
require 'json'
require 'xcodeproj'

root = File.expand_path('..', __dir__)
project_path = File.join(root, 'ios/App/App.xcodeproj')
manifest_path = File.join(root, 'ios/App/App/PrivacyInfo.xcprivacy')
FileUtils.cp(File.join(root, 'native/ios/PrivacyInfo.xcprivacy'), manifest_path)
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |candidate| candidate.name == 'App' }
raise 'App target not found' unless target
group = project.main_group.find_subpath('App', false)
raise 'App group not found' unless group
reference = group.files.find { |file| file.path == 'PrivacyInfo.xcprivacy' } || group.new_file('PrivacyInfo.xcprivacy')
unless target.resources_build_phase.files_references.include?(reference)
  target.resources_build_phase.add_file_reference(reference)
end
version = JSON.parse(File.read(File.join(root, 'package.json'))).fetch('version')
target.build_configurations.each do |configuration|
  configuration.build_settings['MARKETING_VERSION'] = version
  configuration.build_settings['CURRENT_PROJECT_VERSION'] = ENV.fetch('GITHUB_RUN_NUMBER', '1')
end
project.save
