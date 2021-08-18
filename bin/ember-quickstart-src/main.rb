# frozen_string_literal: true

require "optparse"
require "erb"

class QuickStarter
  attr_accessor :app_name, :app_dir_name

  def self.create
    new.create_app
  end

  def self.parse_command_line_args
    options = {}

    opt_parser = OptionParser.new do |opts|
      opts.banner = "Usage: ember-quickstart myapp [options]"

      opts.on("-d", "--dir [STRING]", "Name of directory") do |v|
        options[:dir] = v
      end
    end

    opt_parser.parse!

    app_name = ARGV.pop

    raise "Must specify an app name" unless app_name

    options[:app_name] = app_name
    options[:dir] ||= app_name

    options
  end

  def initialize
    opts = self.class.parse_command_line_args

    @app_name = opts[:app_name]
    @app_dir_name = opts[:dir]
  end

  def create_app
    system("ember new #{app_name} --directory=#{app_dir_name} --welcome=false")
    exec_command("git add -A && git commit --amend --no-edit")

    add_tailwindcss
    configure_linters
    setup_auth

    puts "Quickstart complete"
  end

  def add_tailwindcss
    npm_install(%w[autoprefixer ember-cli-postcss tailwindcss])

    copy_template_file_to_app("tailwind.config.js", ".")
    copy_template_file_to_app("ember-cli-build.js", ".")
    copy_template_file_to_app("app.css", "./app/styles")

    git_commit_all("Set up tailwindcss")
  end

  def configure_linters
    npm_install(%w[eslint-plugin-prefer-let])

    copy_template_file_to_app(".eslintrc.js", ".")
    copy_template_file_to_app(".prettierrc.js", ".")

    git_commit_all("Configure eslint and prettier")
  end

  def setup_auth
    npm_install(%w[active-model-adapter ember-concurrency ember-concurrency-decorators ember-simple-auth-token])

    exec_command("mkdir #{ember_app_dir}/app/adapters")
    exec_command("mkdir #{ember_app_dir}/app/serializers")

    write_erb_to_app("environment.erb", "./config/environment.js")
    write_erb_to_app("router.erb", "./app/router.js")
    write_erb_to_app("application_adapter.erb", "./app/adapters/application.js")

    copy_template_file_to_app("application_serializer.js", "./app/serializers/application.js")
    copy_template_file_to_app("login_controller.js", "./app/controllers/login.js")
    copy_template_file_to_app("login_route.js", "./app/routes/login.js")
    copy_template_file_to_app("login_template.hbs", "./app/templates/login.hbs")

    git_commit_all("Set up basic auth functionality")
  end

  def write_erb_to_app(template_path, output_path)
    template_path_full = File.expand_path(template_path, template_dir)
    template = File.read(template_path_full)

    new_file_content = ERB.new(template).result(binding)

    output_path_full = File.expand_path(output_path, ember_app_dir)

    File.open(output_path_full, "w") do |file|
      file.write(new_file_content)
    end
  end

  def ember_app_dir
    "#{Dir.getwd}/#{app_dir_name}"
  end

  def template_dir
    "#{__dir__}/templates"
  end

  def exec_command(command)
    system(command, chdir: ember_app_dir)
  end

  def git_commit_all(message)
    exec_command("git add -A && git commit -m '#{message}'")
  end

  def npm_install(packages)
    exec_command("npm i -D #{packages.join(" ")}")
  end

  def copy_template_file_to_app(src, dest)
    src_full_path = File.expand_path(src, template_dir)
    dest_full_path = File.expand_path(dest, ember_app_dir)

    exec_command("cp #{src_full_path} #{dest_full_path}")
  end
end

QuickStarter.create
