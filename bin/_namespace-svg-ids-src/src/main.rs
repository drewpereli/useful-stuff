use clap::Parser;
use regex::Regex;

/// Prepend ids in an svg file with the file name
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
  /// The path to the file
  file: std::path::PathBuf
}

fn prepend_ids(content: String, prepend: String) -> String {
  let regex = Regex::new(r#"id="(.+?)""#).unwrap();

  let mut ids: Vec<String> = Vec::new();

  for cap in regex.captures_iter(&content) {
    ids.push(String::from(&cap[1]));
  }

  let joined = ids.join("|");

  let replace_use_regex = Regex::new(format!("#({})", joined).as_str()).unwrap();
  let replace_id_regex = Regex::new(format!("id=\"({})\"", joined).as_str()).unwrap();
  
  let use_replaced = replace_use_regex.replace_all(&content, format!("#{}_$1", prepend).as_str());

  replace_id_regex.replace_all(&use_replaced, format!("id=\"{}_$1\"", prepend).as_str()).to_string()
}

fn main() {
  let args = Args::parse();

  let content = std::fs::read_to_string(&args.file).unwrap();

  let with_extension_stripped = args.file.with_extension("");
  let file_name = with_extension_stripped.file_name().unwrap().to_str().unwrap();
  
  let updated = prepend_ids(content, file_name.to_string());

  std::fs::write(&args.file, updated).expect("Unable to write file");
}

mod test {
  use super::*;

  fn test_case(input_text: &str, prepend: &str, expected: &str) {
    assert_eq!(prepend_ids(input_text.to_string(), prepend.to_string()), expected.to_string())
  }
  
  #[test]
  /// empty strings
  fn test_empty_strings() {
      test_case("", "", "");
  }

  #[test]
  /// empty strings
  fn test_simple_case() {
      test_case("<p id=\"abc\"></div><p use=\"#abc\"/>", "def", "<p id=\"def_abc\"></div><p use=\"#def_abc\"/>");
  }
  
}
