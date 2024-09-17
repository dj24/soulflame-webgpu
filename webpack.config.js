const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const TSConfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

module.exports = () => {
  return {
    entry: "./src/app.ts",
    mode: "development",
    output: {
      filename: "main.js",
      path: path.resolve(__dirname, "dist"),
    },
    devServer: {
      static: {
        directory: path.join(__dirname, "dist"),
      },
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      compress: true,
      port: 8080, // You can change the port if needed
    },
    resolve: {
      extensions: [".ts", ".js", ".json"],
      plugins: [new TSConfigPathsPlugin()],
    },
    module: {
      rules: [
        {
          test: /\.ts?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.wgsl$/i,
          type: "asset/source",
        },
        {
          test: /\.(css)$/,
          use: [MiniCssExtractPlugin.loader, "css-loader"],
        },
        // {
        //   test: /\.(png|jpg|jpeg)$/i,
        //   loader: "file-loader",
        // },
        {
          test: /\.c$/,
          use: [
            {
              loader: path.resolve(__dirname, "c-loader.js"),
            },
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./index.html",
      }),
      new MiniCssExtractPlugin(),
      new CopyWebpackPlugin({
        patterns: [
          { from: "public", to: "" }, // Copy everything from public to the root of dist
        ],
      }),
    ],
    experiments: {
      topLevelAwait: true, // Enable top-level await
      asyncWebAssembly: true, // Enable async WebAssembly
    },
  };
};
