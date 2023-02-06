use anyhow::{Context, Result};
use clap::Parser;
use convert_case::{Case, Casing};
use pluralizer::pluralize;
use regex::Regex;

/// Search for a table definition in your rails schema.rb file
#[derive(Parser)]
struct Cli {
    /// The table to look for
    table: String,
}

fn main() -> Result<()> {
    pluralizer::initialize();

    let args = Cli::parse();
    let snake_table = args.table.to_case(Case::Snake);
    let table = pluralize(&snake_table, 2, false);

    let reg = Regex::new(format!(r#"(?s)\s\screate_table "{}".+?\send\s"#, table).as_str()).with_context(|| format!("regex failed"))?;

    let content = std::fs::read_to_string("./db/schema.rb").with_context(|| format!("could find schema.rb"))?;

    let mat = reg.find(&content).with_context(|| format!("table not found"))?;

    println!("{}", mat.as_str());

    Ok(())
}
