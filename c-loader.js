const { execSync } = require("child_process");
const { readFileSync } = require("fs");

module.exports = async function (source, ...args) {
  let fileNameParts = this.resourcePath.split("/");
  // Windows fix
  if (fileNameParts.length < 2) {
    fileNameParts = this.resourcePath.split("\\");
  }
  const fileName = fileNameParts[fileNameParts.length - 1];
  const fileNameWithoutExtension = fileName.split(".")[0];
  fileNameParts.pop();
  const jsOutputPath = `${__dirname}/public/${fileNameWithoutExtension}.js`;
  execSync(
    `emcc ${this.resourcePath} -o ${jsOutputPath} -msimd128 -O3 -s ENVIRONMENT=web -s MODULARIZE=1 -s NO_EXIT_RUNTIME=1 -s EXPORTED_FUNCTIONS=['_malloc'] -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']`,
  );
  return readFileSync(jsOutputPath, "utf8");
};
