from app.services.package_extract import extract_package_refs


def test_skips_stdlib():
    assert extract_package_refs("import os\nfrom json import loads\n") == []


def test_maps_known_alias():
    refs = extract_package_refs("from dotenv import load_dotenv\n")
    assert [(r.name, r.source) for r in refs] == [("python-dotenv", "import")]


def test_unmapped_import_becomes_candidate():
    refs = extract_package_refs("import langchain_foo\n")
    assert refs[0].name == "langchain-foo"
    assert refs[0].source == "import"


def test_deepseek_provider():
    code = 'init_chat_model("deepseek:deepseek-chat")\n'
    refs = extract_package_refs(code)
    assert any(r.name == "langchain-deepseek" and r.source == "provider" for r in refs)


def test_unknown_provider_heuristic():
    refs = extract_package_refs('init_chat_model("acme:model-x")\n')
    assert any(r.name == "langchain-acme" and r.source == "provider" for r in refs)
