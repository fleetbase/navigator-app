source 'https://rubygems.org'

# Pinned by .ruby-version. The floor is 3.1 rather than 2.6: CocoaPods'
# dependency chain pulls `nkf`, whose C extension does not build on 2.7.4, so a
# machine defaulting to an older Ruby fails during `bundle install` with an
# error that says nothing about Ruby versions.
ruby '>= 3.1'

# React Native 0.86 ships podspecs that declare a `visionos` deployment target —
# 13 of them in node_modules — and CocoaPods only understands that platform from
# 1.15 onward. The previous constraint asked for `>= 1.13` while excluding 1.15.0
# and 1.15.1, so resolution landed on 1.14.3, which cannot parse those podspecs
# and fails with "Unsupported platform `visionos`".
gem 'cocoapods', '>= 1.16'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'

# `xcodeproj < 1.26.0` used to be pinned here. That is unsatisfiable alongside a
# working CocoaPods: 1.17.0 requires xcodeproj >= 1.28.1, so the two constraints
# together had no solution and `bundle install` could not produce a CocoaPods
# capable of building this app at all. Its version is left to CocoaPods.
