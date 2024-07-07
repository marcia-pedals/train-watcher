{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    (pkgs.python3.withPackages (python-pkgs: [
        python-pkgs.httpx
        python-pkgs.ipython
        python-pkgs.tqdm
        python-pkgs.shapely
        python-pkgs.jupyter
    ]))
    pkgs.nodejs_20
    pkgs.nodePackages.vercel
  ];
}
