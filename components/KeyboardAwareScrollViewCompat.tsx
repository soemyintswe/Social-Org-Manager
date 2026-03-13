// template
import { ScrollView, ScrollViewProps } from "react-native";

type Props = ScrollViewProps & { bottomOffset?: number };

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  // if (Platform.OS === "web") {
  //   return (
  //     <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
  //       {children}
  //     </ScrollView>
  //   );
  // }
  return <ScrollView {...props}>{children}</ScrollView>;
  // return (
  //   <KeyboardAvoidingView
  //     behavior={Platform.OS === "ios" ? "padding" : "height"}
  //     style={{ flex: 1 }}
  //     keyboardVerticalOffset={props.bottomOffset || 0}
  //   >
  //     <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
  //       {children}
  //     </ScrollView>
  //   </KeyboardAvoidingView>
  // );
}
