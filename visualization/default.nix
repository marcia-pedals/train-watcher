{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    (pkgs.python3.withPackages (python-pkgs: [
        python-pkgs.httpx
        python-pkgs.ipython
        python-pkgs.tqdm
    ]))
    pkgs.nodejs_20
    pkgs.nodePackages.vercel
  ];
}
