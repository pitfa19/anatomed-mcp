"""Extract pinned upstream archive and run inventory without changing source data."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def revision(repo):
    return subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--upstream", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--converter", type=Path, required=True)
    p.add_argument("--blender", default="/opt/homebrew/bin/blender")
    args = p.parse_args()
    out = args.output.resolve()
    if ".jcode/scratch/" not in str(out):
        p.error("Output must be under .jcode/scratch, never an application or upstream directory")
    out.mkdir(parents=True, exist_ok=True)
    archive = args.upstream / "Z-Anatomy.zip"
    archive_before = digest(archive)
    extracted = out / "extracted"
    with zipfile.ZipFile(archive) as z:
        members = [{"name": x.filename, "bytes": x.file_size, "crc32": f"{x.CRC:08x}"} for x in z.infolist()]
        for info in z.infolist():
            target = (extracted / info.filename).resolve()
            if not target.is_relative_to(extracted.resolve()):
                raise ValueError("Unsafe archive member: " + info.filename)
        # These are read-only input copies. No source archive or checkout writes.
        z.extractall(extracted)
    blend = extracted / "Z-Anatomy" / "Startup.blend"
    provenance = {"schema_version": 1, "upstream_revision": revision(args.upstream),
        "archive": {"path": str(archive), "sha256": archive_before, "members": members},
        "blend": {"path": str(blend), "sha256": digest(blend)},
        "converter": {"path": str(args.converter), "sha256": digest(args.converter),
            "revision": revision(args.converter.parent.parent)},
        "command": [args.blender, "--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1",
            "--python", str(Path(__file__).with_name("blender_inventory.py")), "--", str(blend), str(out / "inventory.json")]}
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    with (out / "blender.log").open("w") as log:
        result = subprocess.run(provenance["command"], stdout=log, stderr=subprocess.STDOUT)
    assert digest(archive) == archive_before, "Upstream archive changed"
    assert digest(blend) == provenance["blend"]["sha256"], "Extracted original changed"
    if result.returncode:
        print((out / "blender.log").read_text()[-12000:], file=sys.stderr)
        raise SystemExit(result.returncode)
    print("Inventory complete:", out / "inventory.json")


if __name__ == "__main__":
    main()
