# Application fonts

The application bundles the normal, variable Latin subsets of Inter (100–900)
and Lora (400–600), using `next/font/local`. Font downloads happen only when
updating these checked-in assets; production builds do not contact Google Fonts.

Sources:

- [Inter, Google Fonts v20](https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2)
- [Lora, Google Fonts v37](https://fonts.gstatic.com/s/lora/v37/0QIvMX1D_JOuMwr7I_FMl_E.woff2)
- [Inter license](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt)
- [Lora license](https://github.com/google/fonts/blob/main/ofl/lora/OFL.txt)

Both fonts use the SIL Open Font License; their license notices are included here.
Run `bun run test:fonts` to verify the production definitions still compile
without the Google Fonts response path that caused intermittent container builds
to fail (Next.js issue [#99114](https://github.com/vercel/next.js/issues/99114)).
