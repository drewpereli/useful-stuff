# frozen_string_literal: true

class RspecRequestScaffoldGenerator < Rails::Generators::NamedBase
  source_root File.expand_path("templates", __dir__)

  def write_scaffold_spec
    template "template.erb", "spec/requests/#{plural_name}_spec.rb"
  end

  def included_actions
    model_routes.map { |hash| hash[:action] }.uniq
  end

  def model_routes
    Rails.application.routes.routes.map(&:defaults).filter do |hash|
      Regexp.new("#{plural_name}$").match?(hash[:controller])
    end
  end

  def included_non_standard_actions
    included_actions.reject do |action|
      %w[index show create update destroy].include?(action)
    end
  end

  def model_class
    class_name.constantize
  end

  def model_writable_attrs
    model_class.attribute_names.reject do |name|
      %w[id created_at updated_at].include?(name)
    end
  end

  def model_writable_attrs_with_suggested_values
    column_defaults = model_class.column_defaults
    columns = model_class.columns

    model_writable_attrs.map do |name|
      suggested_value = if column_defaults[name]
                          column_defaults[name]
                        else
                          column = columns.find { |c| c.name == name }
                          type = column.type

                          SUGGESTED_VALUES_BY_TYPE[type]
                        end

      {
        name: name,
        suggested_value: suggested_value
      }
    end
  end

  SUGGESTED_VALUES_BY_TYPE = {
    boolean: false,
    string: '"my val"',
    integer: 1
  }.freeze
end
