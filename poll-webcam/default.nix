{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    (pkgs.python3.withPackages (python-pkgs: [
        python-pkgs.httpx
        python-pkgs.ipython
    ]))
  ];
}
