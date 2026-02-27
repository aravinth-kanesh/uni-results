from collections import defaultdict

class UniResults:
    def __init__(self, weightings):
        """
        weightings: dict mapping year -> contribution to final degree (e.g. {2: 0.4, 3: 0.6})
        """
        self.weightings = weightings
        self.grades_total = defaultdict(int)      # sum of grade * credits per year
        self.credits_achieved = defaultdict(int)  # total credits per year
        self.rwa = 0                              # running weighted average

    def add_module_grade(self, year, grade, credits=15):
        """Add a module grade for a given year, with optional credits (default 15)."""
        self.grades_total[year] += grade * credits
        self.credits_achieved[year] += credits
        self._calculate_rwa()

    def _calculate_rwa(self):
        rwa = 0
        total_weight = 0
        for year, weight in self.weightings.items():
            if self.credits_achieved.get(year, 0) > 0:
                year_avg = self.grades_total[year] / self.credits_achieved[year]
                rwa += weight * year_avg
                total_weight += weight
        self.rwa = rwa / total_weight if total_weight > 0 else 0

    def get_rwa(self):
        return self.rwa

    def required_average_for_remaining_credits(self, target, total_credits_per_year):
        """
        Calculate the minimum average across all remaining credits (all years)
        to reach the target final degree.
        """
        completed_contribution = 0
        denominator = 0

        for year, weight in self.weightings.items():
            total_credits = total_credits_per_year[year]
            completed_credits = self.credits_achieved.get(year, 0)
            remaining_credits = total_credits - completed_credits

            # Contribution from completed credits
            if completed_credits > 0:
                year_avg = self.grades_total[year] / completed_credits
                completed_contribution += weight * (year_avg * completed_credits / total_credits)

            # Fraction of weighting for remaining credits
            if remaining_credits > 0:
                denominator += weight * (remaining_credits / total_credits)

        if denominator == 0:
            # No remaining credits
            if self.get_rwa() >= target:
                return 0  # target already achieved
            else:
                return float("inf")  # impossible

        required_average = (target - completed_contribution) / denominator
        return required_average

    def summary(self, total_credits_per_year, targets=[70, 75, 80]):
        """
        Prints current RWA and required averages for all remaining credits for each target.
        """
        print(f"Current Running Weighted Average (RWA): {self.get_rwa():.2f}\n")
        print(f"{'Target':>8} | {'Required Avg Remaining':>22} | Status")
        print("-" * 60)

        for t in targets:
            req = self.required_average_for_remaining_credits(t, total_credits_per_year)
            if req == 0:
                status = "Already achieved"
                req_str = "-"
            elif req == float("inf"):
                status = "Impossible"
                req_str = "-"
            else:
                status = "Required"
                req_str = f"{req:.2f}%"
            print(f"{t:>8}% | {req_str:>22} | {status}")


if __name__ == "__main__":
    # Weightings
    weightings = {2: 0.4, 3: 0.6}
    uni_results = UniResults(weightings)

    # Year 2: 6 x 15-credit modules + 1 x 30-credit module
    year2_grades_15 = [76, 84, 88, 72, 78, 70]
    year2_grade_30 = 71

    for g in year2_grades_15:
        uni_results.add_module_grade(2, g)  # 15 credits
    uni_results.add_module_grade(2, year2_grade_30, credits=30)  # 30 credits module

    # Year 3: 3 x 15-credit modules so far
    year3_grades = [69, 94, 80]
    for g in year3_grades:
        uni_results.add_module_grade(3, g)

    # Total credits per year
    total_credits = {2: 120, 3: 120}

    # Print summary for targets 70, 75, 80
    uni_results.summary(total_credits_per_year=total_credits, targets=[70, 75, 80])
