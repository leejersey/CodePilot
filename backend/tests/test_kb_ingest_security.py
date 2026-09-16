from app.services.kb_ingest import safe_upload_filename


def test_upload_filename_cannot_escape_document_directory():
    assert safe_upload_filename("../../secrets.txt") == "secrets.txt"
    assert safe_upload_filename("/tmp/override.md") == "override.md"
